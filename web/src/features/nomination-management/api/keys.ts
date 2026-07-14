/**
 * nominationManagementKeys — query/mutation keys для фичи nomination-management.
 * Иерархия: ['nomination-management', <scope>, ...params] (см. ADR 0006).
 */
export const nominationManagementKeys = {
  list: (tournamentId: string) => ["nomination-management", "list", tournamentId] as const,
  // poolLayoutStatus — статус раскладки бойцов по пулам для одной номинации
  // (draft/ready/...); используется списком номинаций для бейджа статуса.
  poolLayoutStatus: (nominationId: string) =>
    ["nomination-management", "pool-status", nominationId] as const,
};
