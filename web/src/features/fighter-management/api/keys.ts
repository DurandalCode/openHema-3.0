import type { RosterListQuery } from "./requests";

/**
 * normalizeRosterQuery — стабильная форма фильтра ростера для query key
 * (спека 0041): множественные измерения (`statuses`/`nominationIds`/
 * `clubs`) приходят из `Set` (порядок итерации не гарантирован) — без
 * сортировки одинаковый фильтр с разным порядком добавления элементов дал
 * бы разные ключи и лишний рефетч/потерю кеша.
 */
export function normalizeRosterQuery(query: RosterListQuery) {
  return {
    statuses: [...(query.statuses ?? [])].sort(),
    nominationIds: [...(query.nominationIds ?? [])].sort(),
    clubs: [...(query.clubs ?? [])].sort(),
    includeNoClub: Boolean(query.includeNoClub),
    search: query.search?.trim() ?? "",
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * fighterManagementKeys — query/mutation keys для фичи fighter-management
 * (admin, спека 0007). Иерархия: ['fighter-management', <scope>, ...params]
 * (см. ADR 0006).
 *
 * `roster` — постраничный список под текущий фильтр (спека 0041, T20).
 * `fullRoster` — весь ростер турнира одним незафильтрованным запросом
 * (план «Экспорт CSV»/«Риски» — источник для выпадающего списка клубов и
 * полного списка бойцов в `MergeFightersDialog`/карточке, открытой из
 * «Найти по учётке», см. `use-full-roster.ts`).
 */
export const fighterManagementKeys = {
  // all — корень среза: префикс, накрывающий и `roster`, и `fullRoster`.
  // Мутации ростера инвалидируют именно его (широко, но ростер небольшой —
  // см. `use-fighter-mutations.ts`).
  all: () => ["fighter-management"] as const,
  roster: (tournamentId: string, query: RosterListQuery) =>
    ["fighter-management", "roster", tournamentId, normalizeRosterQuery(query)] as const,
  fullRoster: (tournamentId: string) => ["fighter-management", "full-roster", tournamentId] as const,
};
