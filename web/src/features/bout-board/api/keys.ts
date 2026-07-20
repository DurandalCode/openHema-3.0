/**
 * boutBoardKeys — query/mutation keys для фичи bout-board (спека 0013).
 * Иерархия: ['bout-board', <scope>, ...params] (см. ADR 0006). Доска
 * ведётся per-арена (текущий бой пула = текущий бой арены), поэтому
 * единственный ключ — по `arenaId`.
 */
export const boutBoardKeys = {
  board: (arenaId: string) => ["bout-board", "board", arenaId] as const,
};
