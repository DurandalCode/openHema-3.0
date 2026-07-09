/**
 * nominationManagementKeys — query/mutation keys для фичи nomination-management.
 * Иерархия: ['nomination-management', <scope>, ...params] (см. ADR 0006).
 */
export const nominationManagementKeys = {
  list: (tournamentId: string) => ["nomination-management", "list", tournamentId] as const,
};
