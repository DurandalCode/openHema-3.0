/**
 * applicationReviewKeys — query keys для фичи application-review (admin,
 * см. ADR 0006). Иерархия: ['application-review', <scope>, ...params].
 */
export const applicationReviewKeys = {
  overview: (tournamentId: string, status: number | null, nominationId: string | null) =>
    ["application-review", "overview", tournamentId, status, nominationId] as const,
};
