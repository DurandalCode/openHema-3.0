import { FighterStatus } from "@/gen/hema/v1/fighter_pb";

/**
 * roster-query.ts — парсинг query-параметров фильтра ростера (спека 0041,
 * FR-1..FR-3), общий для `GET /api/admin/fighters` (T20, постраничный
 * список) и `GET /api/admin/fighters/export` (T24, CSV — те же фильтры, без
 * page/pageSize, FR-14). Единственное место, где строковые метки статуса из
 * query превращаются в `hema.v1.FighterStatus` — расхождение в маппинге
 * между списком и экспортом было бы трудноуловимым багом.
 */

const FIGHTER_STATUS_BY_LABEL: Record<string, FighterStatus> = {
  FIGHTER_STATUS_UNSPECIFIED: FighterStatus.UNSPECIFIED,
  FIGHTER_STATUS_ACTIVE: FighterStatus.ACTIVE,
  FIGHTER_STATUS_WITHDRAWN: FighterStatus.WITHDRAWN,
  FIGHTER_STATUS_MERGED: FighterStatus.MERGED,
};

export type RosterFilterParams = {
  tournamentId?: string;
  statuses: FighterStatus[];
  nominationIds: string[];
  clubs: string[];
  includeNoClub: boolean;
  search?: string;
};

export type RosterFilterParamsError = { error: string };

/**
 * parseRosterFilterParams — читает `tournamentId`/`statuses[]`/
 * `nominationIds[]`/`clubs[]`/`includeNoClub`/`search` из query. Пустое
 * измерение (нет значений в query) = без ограничения по нему (FR-3), как и
 * на сервере. Неизвестная метка статуса — ошибка (400), а не молчаливый
 * пропуск.
 */
export function parseRosterFilterParams(
  params: URLSearchParams,
): RosterFilterParams | RosterFilterParamsError {
  const tournamentId = params.get("tournamentId") ?? undefined;

  const statuses: FighterStatus[] = [];
  for (const label of params.getAll("statuses")) {
    const parsed = FIGHTER_STATUS_BY_LABEL[label];
    if (parsed === undefined) {
      return { error: `invalid status: ${label}` };
    }
    statuses.push(parsed);
  }

  const nominationIds = params.getAll("nominationIds");
  const clubs = params.getAll("clubs");
  const includeNoClub = params.get("includeNoClub") === "1";

  const searchRaw = params.get("search");
  const search = searchRaw && searchRaw.trim() !== "" ? searchRaw : undefined;

  return { tournamentId, statuses, nominationIds, clubs, includeNoClub, search };
}

export function isRosterFilterParamsError(
  value: RosterFilterParams | RosterFilterParamsError,
): value is RosterFilterParamsError {
  return "error" in value;
}

/**
 * parsePositiveInt — читает целое положительное число из query-параметра
 * (`page`/`pageSize`), иначе `fallback` (отсутствует, не число, `<= 0`).
 */
export function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export type RosterStatusCounts = { active: number; withdrawn: number };

/**
 * toRosterStatusCounts — сворачивает `FighterStatusCount[]` ответа
 * `ListRoster` (`{status, count}`, не зависят от фильтра, FR-4) в
 * `{active, withdrawn}` — форму, которой уже пользуется UI (`StatusCounts`,
 * `features/fighter-management/lib/select-fighters.ts`).
 */
export function toRosterStatusCounts(
  counts: { status: FighterStatus; count: number }[],
): RosterStatusCounts {
  let active = 0;
  let withdrawn = 0;
  for (const c of counts) {
    if (c.status === FighterStatus.ACTIVE) active = c.count;
    else if (c.status === FighterStatus.WITHDRAWN) withdrawn = c.count;
  }
  return { active, withdrawn };
}
