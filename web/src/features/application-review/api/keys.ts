import type { ApplicationState } from "@/entities/application/lib/types";

/**
 * applicationReviewKeys — query keys для фичи application-review (admin,
 * см. ADR 0006). Иерархия: ['application-review', <scope>, ...params].
 *
 * `overview` несёт весь фильтр + страницу (спека 0041, план «Web»): смена
 * любого параметра — статуса, номинации, флага экипировки, поиска или
 * страницы — сама меняет query key, TanStack Query рефетчит без отдельной
 * инвалидации. `statuses`/`nominationIds` сортируются перед попаданием в
 * ключ — порядок обхода `Set` не гарантирован, а один и тот же выбор не
 * должен давать разные ключи (и, как следствие, разные записи кеша).
 */
export const applicationReviewKeys = {
  overview: (
    tournamentId: string,
    statuses: ApplicationState[],
    nominationIds: string[],
    needsEquipment: boolean,
    search: string,
    page: number,
    pageSize: number,
  ) =>
    [
      "application-review",
      "overview",
      tournamentId,
      [...statuses].sort(),
      [...nominationIds].sort(),
      needsEquipment,
      search,
      page,
      pageSize,
    ] as const,
  /** detail — заявка с историей событий, запрашивается при открытии карточки (FR-20). */
  detail: (applicationId: string) => ["application-review", "detail", applicationId] as const,
};
