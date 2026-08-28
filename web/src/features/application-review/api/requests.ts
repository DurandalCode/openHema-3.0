import type { Application, ApplicationEvent, ApplicationState } from "@/entities/application/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";
import type { ApplicationStatusCount } from "../lib/select-applications";

export type ApplicationResult =
  | { ok: true; application: Application }
  | { ok: false; error: string };

export type RegisterFighterResult =
  | { ok: true; application: Application; capacityExceeded: boolean }
  | { ok: false; error: string };

/**
 * OverviewFilters — фильтр+постраничность сводного экрана заявок (спека
 * 0041, FR-1..FR-6): статусы/номинации — множественный выбор (пусто = без
 * ограничения по измерению), `needsEquipment` — точечный флаг,
 * `search` — подстрока по имени заявителя и клубу без учёта регистра.
 * `page`/`pageSize` — постраничность на языке экрана (1-based номер
 * страницы); фетчер сам переводит их в `limit`/`offset` на проводе.
 */
export type OverviewFilters = {
  statuses?: Set<ApplicationState> | ApplicationState[];
  nominationIds?: Set<string> | string[];
  needsEquipment?: boolean;
  search?: string;
  page: number;
  pageSize: number;
};

export type ApplicationsOverviewResult =
  | {
      ok: true;
      applications: Application[];
      totalCount: number;
      statusCounts: ApplicationStatusCount[];
    }
  | { ok: false; error: string };

/**
 * listApplicationsOverviewRequest — GET /api/applications/overview (admin).
 * Сводный экран заявок турнира: фильтр/поиск/постраничность выполняются на
 * сервере (спека 0041) — этот фетчер только строит query-строку и
 * распаковывает ответ, сам список/срез больше не режется на клиенте.
 *
 * `statuses`/`nominationIds` — повторяющиеся query-параметры
 * (`?statuses=X&statuses=Y`), симметрично тому, что читает BFF-роут
 * (`app/api/applications/overview/route.ts`, `getAll`). `page`/`pageSize`
 * переводятся в `limit`/`offset` здесь, а не на экране — постраничность на
 * проводе везде в проекте выражена этим стилем (`GET /api/admin/users`).
 */
export async function listApplicationsOverviewRequest(
  tournamentId: string,
  filters: OverviewFilters,
): Promise<ApplicationsOverviewResult> {
  const params = new URLSearchParams({ tournamentId });
  for (const status of filters.statuses ?? []) params.append("statuses", status);
  for (const nominationId of filters.nominationIds ?? []) params.append("nominationIds", nominationId);
  if (filters.needsEquipment) params.set("needsEquipment", "true");
  const search = filters.search?.trim();
  if (search) params.set("search", search);
  params.set("limit", String(filters.pageSize));
  params.set("offset", String((filters.page - 1) * filters.pageSize));

  const res = await apiFetch<{
    applications?: Application[];
    totalCount?: number;
    statusCounts?: ApplicationStatusCount[];
  }>(`/api/applications/overview?${params.toString()}`, { method: "GET" });
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    applications: res.data.applications ?? [],
    totalCount: res.data.totalCount ?? 0,
    statusCounts: res.data.statusCounts ?? [],
  };
}

/** confirmPaymentRequest — POST /api/applications/[id]/confirm-payment (admin). */
export async function confirmPaymentRequest(applicationId: string): Promise<ApplicationResult> {
  const res = await apiFetch<{ application?: Application }>(
    `/api/applications/${encodeURIComponent(applicationId)}/confirm-payment`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, application: res.data.application as Application };
}

/**
 * registerFighterRequest — POST /api/applications/[id]/register (admin).
 * Терминальный шаг флоу; capacityExceeded — мягкое предупреждение о
 * переполнении номинации (soft cap), не блокирует регистрацию.
 */
export async function registerFighterRequest(applicationId: string): Promise<RegisterFighterResult> {
  const res = await apiFetch<{ application?: Application; capacityExceeded?: boolean }>(
    `/api/applications/${encodeURIComponent(applicationId)}/register`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    application: res.data.application as Application,
    capacityExceeded: res.data.capacityExceeded ?? false,
  };
}

export type EditApplicationInput = {
  club?: string;
  needsEquipment?: boolean;
  applicantNameOverride?: string;
  nominationId?: string;
  state?: ApplicationState;
};

/**
 * editApplicationRequest — POST /api/applications/[id]/edit (admin). Правка
 * заявки: клуб, признак экипировки, переопределение имени, перенос номинации
 * и/или ручная смена статуса (спека 0006, FR-3..FR-9). Допустимо над заявкой
 * в любом состоянии.
 */
export async function editApplicationRequest(
  applicationId: string,
  input: EditApplicationInput,
): Promise<ApplicationResult> {
  const res = await apiFetch<{ application?: Application }>(
    `/api/applications/${encodeURIComponent(applicationId)}/edit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, application: res.data.application as Application };
}

export type ApplicationDetailResult =
  | { ok: true; application: Application; history: ApplicationEvent[] }
  | { ok: false; error: string };

/**
 * getApplicationRequest — GET /api/applications/[id] (owner заявки либо
 * admin, проверяется сервером). Заявка с историей событий — отдельно от
 * сводного списка (spec FR-16/FR-20): запрашивается только при открытии
 * карточки.
 */
export async function getApplicationRequest(applicationId: string): Promise<ApplicationDetailResult> {
  const res = await apiFetch<{ application?: Application; history?: ApplicationEvent[] }>(
    `/api/applications/${encodeURIComponent(applicationId)}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    application: res.data.application as Application,
    history: res.data.history ?? [],
  };
}
