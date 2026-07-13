/**
 * fighterManagementKeys — query/mutation keys для фичи fighter-management
 * (admin, спека 0007). Иерархия: ['fighter-management', <scope>, ...params]
 * (см. ADR 0006).
 */
export const fighterManagementKeys = {
  roster: (tournamentId: string) => ["fighter-management", "roster", tournamentId] as const,
};
