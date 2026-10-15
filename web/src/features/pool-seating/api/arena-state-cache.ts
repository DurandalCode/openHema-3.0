import type { QueryClient } from "@tanstack/react-query";
import { poolSeatingKeys } from "./keys";
import type { ArenaPoolsState, PoolsForArenaResult } from "./requests";

/**
 * unwrapArenaState — достаёт состояние страницы арены из результата fetcher'а
 * мутации очереди; ошибку сервера пробрасывает как `Error` (так её видит
 * `mutation.error`).
 */
export function unwrapArenaState(res: PoolsForArenaResult): ArenaPoolsState {
  if (!res.ok) throw new Error(res.error);
  return { seated: res.seated, available: res.available, queued: res.queued };
}

/**
 * applyArenaState (спека 0063) — кладёт ответ мутации в кэш этой арены (UI
 * перерисовывается без второго запроса) и помечает устаревшими кэши
 * остальных арен: перенос пула убирает его из очереди другой арены, а
 * постановка/снятие меняет их `available`.
 */
export function applyArenaState(qc: QueryClient, arenaId: string, state: ArenaPoolsState): void {
  qc.setQueryData(poolSeatingKeys.forArena(arenaId), state);
  qc.invalidateQueries({
    queryKey: poolSeatingKeys.allForArenas,
    predicate: (q) => q.queryKey[2] !== arenaId,
  });
}
