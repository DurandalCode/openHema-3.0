"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applyArenaState, unwrapArenaState } from "./arena-state-cache";
import { enqueuePoolRequest } from "./requests";

/**
 * useEnqueuePool — мутация добавления пула в конец очереди арены (спека
 * 0063, FR-3..FR-5). Ответ сервера (seated/available/queued) сразу попадает
 * в кэш арены.
 */
export function useEnqueuePool(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => unwrapArenaState(await enqueuePoolRequest(poolId, arenaId)),
    onSuccess: (state) => applyArenaState(qc, arenaId, state),
  });
}
