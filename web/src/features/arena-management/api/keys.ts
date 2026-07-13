/**
 * arenaManagementKeys — query/mutation keys для фичи arena-management.
 * Иерархия: ['arena-management', <scope>, ...params] (см. ADR 0006).
 */
export const arenaManagementKeys = {
  list: (tournamentId: string) => ["arena-management", "list", tournamentId] as const,
  detail: (id: string) => ["arena-management", "detail", id] as const,
};