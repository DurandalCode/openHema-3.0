/**
 * arenaManagementKeys — query/mutation keys для фичи arena-management.
 * Иерархия: ['arena-management', <scope>, ...params] (см. ADR 0006).
 */
export const arenaManagementKeys = {
  list: (tournamentId: string) => ["arena-management", "list", tournamentId] as const,
  detail: (id: string) => ["arena-management", "detail", id] as const,
  // board — свой ключ (не boutBoardKeys соседней фичи arena-management/
  // bout-board): тот инвалидируется мутациями ведения боя, общий ключ
  // связал бы два экрана скрытой зависимостью (спека 0027, plan «Риски»).
  board: (arenaId: string) => ["arena-management", "board", arenaId] as const,
};