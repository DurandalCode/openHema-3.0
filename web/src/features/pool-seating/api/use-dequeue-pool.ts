"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applyArenaState, unwrapArenaState } from "./arena-state-cache";
import { dequeuePoolRequest } from "./requests";

/**
 * useDequeuePool — мутация «убрать пул из очереди арены» (спека 0063, FR-6).
 */
export function useDequeuePool(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => unwrapArenaState(await dequeuePoolRequest(poolId)),
    onSuccess: (state) => applyArenaState(qc, arenaId, state),
  });
}
