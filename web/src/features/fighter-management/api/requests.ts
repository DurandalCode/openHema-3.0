import type {
  Fighter,
  FighterStatus,
  ImportReport,
  WithdrawalReason,
} from "@/entities/fighter/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";
import type { StatusCounts } from "../lib/select-fighters";

export type FighterResult = { ok: true; fighter: Fighter } | { ok: false; error: string };

/**
 * RosterFilterQuery — фильтр/поиск ростера (спека 0041, FR-1..FR-3): пустое/
 * отсутствующее измерение = без ограничения по нему, как и на сервере
 * (`ListRoster`). `clubs` — только реальные названия клубов; «Без клуба»
 * (0026 FR-9) — отдельный флаг `includeNoClub`, не элемент `clubs`.
 */
export type RosterFilterQuery = {
  statuses?: FighterStatus[];
  nominationIds?: string[];
  clubs?: string[];
  includeNoClub?: boolean;
  search?: string;
};

export type RosterListQuery = RosterFilterQuery & { page: number; pageSize: number };

export type RosterListResult =
  | { ok: true; fighters: Fighter[]; totalCount: number; statusCounts: StatusCounts }
  | { ok: false; error: string };

/**
 * FULL_ROSTER_LIMIT — «весь ростер турнира одним запросом» (спека 0041,
 * план «Риски»): `ListRosterResponse` не отдаёт отдельный список уникальных
 * клубов — вместо правки контракта (зафиксирован, не наш трек) выпадающий
 * список клубов (0026 FR-9) и полный список бойцов для
 * `MergeFightersDialog`/карточки, открытой из «Найти по учётке», читают
 * отдельный незафильтрованный запрос с большим `limit`. Компромисс: этот
 * запрос НЕ разделяет цель NFR-1 (ответ не растёт с числом записей) — он
 * растёт, как раньше до инкремента 0041, — но остаётся единственным таким
 * запросом экрана, а не на каждый рендер/фильтр.
 */
export const FULL_ROSTER_LIMIT = 10_000;

/** buildRosterFilterParams — query-параметры фильтра/поиска, без page/pageSize (переиспользуется экспортом). */
export function buildRosterFilterParams(
  tournamentId: string,
  filters: RosterFilterQuery,
): URLSearchParams {
  const params = new URLSearchParams({ tournamentId });
  for (const status of filters.statuses ?? []) params.append("statuses", status);
  for (const nominationId of filters.nominationIds ?? []) params.append("nominationIds", nominationId);
  for (const club of filters.clubs ?? []) params.append("clubs", club);
  if (filters.includeNoClub) params.set("includeNoClub", "1");
  const search = filters.search?.trim();
  if (search) params.set("search", search);
  return params;
}

/**
 * listRosterRequest — GET /api/admin/fighters?tournamentId=...&... (admin,
 * спека 0041): постраничный ростер под текущий фильтр/поиск/страницу.
 */
export async function listRosterRequest(
  tournamentId: string,
  query: RosterListQuery,
): Promise<RosterListResult> {
  const params = buildRosterFilterParams(tournamentId, query);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  const res = await apiFetch<{ fighters?: Fighter[]; totalCount?: number; statusCounts?: StatusCounts }>(
    `/api/admin/fighters?${params}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    fighters: res.data.fighters ?? [],
    totalCount: res.data.totalCount ?? 0,
    statusCounts: res.data.statusCounts ?? { active: 0, withdrawn: 0 },
  };
}

/**
 * rosterExportUrl — URL `GET /api/admin/fighters/export` под текущий
 * фильтр/поиск экрана (спека 0041, FR-14), БЕЗ page/pageSize —
 * экспортируется весь отфильтрованный набор. Обычная ссылка для навигации
 * браузера (план «Риски»: скачивание файла — не `fetch`+blob), не
 * `apiFetch`.
 */
export function rosterExportUrl(tournamentId: string, filters: RosterFilterQuery): string {
  const params = buildRosterFilterParams(tournamentId, filters);
  return `/api/admin/fighters/export?${params}`;
}

export type CreateFighterInput = {
  tournamentId: string;
  name: string;
  club?: string;
  nominationIds?: string[];
};

/** createFighterRequest — POST /api/admin/fighters (admin). */
export async function createFighterRequest(input: CreateFighterInput): Promise<FighterResult> {
  return sendFighter("/api/admin/fighters", "POST", input);
}

/** editFighterRequest — PATCH /api/admin/fighters/[id] (admin). */
export async function editFighterRequest(
  fighterId: string,
  name: string,
  club: string,
): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}`, "PATCH", { name, club });
}

/** withdrawFighterRequest — POST /api/admin/fighters/[id]/withdraw (admin). */
export async function withdrawFighterRequest(
  fighterId: string,
  reason: WithdrawalReason,
): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}/withdraw`, "POST", { reason });
}

/** returnFighterRequest — POST /api/admin/fighters/[id]/return (admin). */
export async function returnFighterRequest(fighterId: string): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}/return`, "POST");
}

/** addToNominationRequest — POST /api/admin/fighters/[id]/nominations (admin). */
export async function addToNominationRequest(
  fighterId: string,
  nominationId: string,
): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}/nominations`, "POST", {
    nominationId,
  });
}

/** removeFromNominationRequest — DELETE /api/admin/fighters/[id]/nominations?nominationId=... (admin). */
export async function removeFromNominationRequest(
  fighterId: string,
  nominationId: string,
): Promise<FighterResult> {
  const params = new URLSearchParams({ nominationId });
  const res = await apiFetch<{ fighter?: Fighter }>(
    `/api/admin/fighters/${encodeURIComponent(fighterId)}/nominations?${params}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighter: res.data.fighter as Fighter };
}

/** moveFighterRequest — POST /api/admin/fighters/[id]/move (admin). */
export async function moveFighterRequest(
  fighterId: string,
  fromNominationId: string,
  toNominationId: string,
): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}/move`, "POST", {
    fromNominationId,
    toNominationId,
  });
}

/**
 * findFighterByAccountRequest — GET /api/fighters/find-by-account?userId=...
 * (admin, спека 0040, FR-9). `tournamentId` опционален — пусто → активный
 * турнир. `fighter: null` в результате — учётке боец в турнире не
 * сопоставлен (не ошибка).
 */
export async function findFighterByAccountRequest(
  userId: string,
  tournamentId?: string,
): Promise<{ ok: true; fighter: Fighter | null } | { ok: false; error: string }> {
  const params = new URLSearchParams({ userId });
  if (tournamentId) params.set("tournamentId", tournamentId);
  const res = await apiFetch<{ fighter: Fighter | null }>(
    `/api/fighters/find-by-account?${params}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighter: res.data.fighter };
}

/**
 * mergeFightersRequest — POST /api/fighters/merge (admin, спека 0040,
 * FR-10/FR-10a): сводит дубль `sourceFighterId` в `targetFighterId`,
 * возвращает итоговую (target) запись.
 */
export async function mergeFightersRequest(
  sourceFighterId: string,
  targetFighterId: string,
): Promise<FighterResult> {
  const res = await apiFetch<{ fighter?: Fighter }>("/api/fighters/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceFighterId, targetFighterId }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighter: res.data.fighter as Fighter };
}

export type ImportFightersOptions = {
  // dryRun — предпросмотр без записи (спека 0049, FR-2). Тот же файл
  // отправляется повторно с `false` на подтверждение: состояния импорта на
  // сервере нет.
  dryRun: boolean;
  // nominationIds — номинации «по умолчанию» на всю загрузку, применяются
  // только к строкам с пустой колонкой номинаций (FR-5a).
  nominationIds?: string[];
};

export type ImportFightersResult =
  | { ok: true; report: ImportReport }
  | { ok: false; error: string };

/**
 * importFightersRequest — POST /api/fighters/import (admin, спека 0049):
 * `multipart/form-data` с самим файлом. `Content-Type` не задаётся руками —
 * boundary проставляет браузер по `FormData`.
 */
export async function importFightersRequest(
  file: File,
  { dryRun, nominationIds }: ImportFightersOptions,
): Promise<ImportFightersResult> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("dryRun", String(dryRun));
  for (const nominationId of nominationIds ?? []) {
    formData.append("nominationIds", nominationId);
  }

  const res = await apiFetch<{ report: ImportReport }>("/api/fighters/import", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, report: res.data.report };
}

async function sendFighter(
  url: string,
  method: "POST" | "PATCH",
  body?: unknown,
): Promise<FighterResult> {
  const res = await apiFetch<{ fighter?: Fighter }>(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighter: res.data.fighter as Fighter };
}
