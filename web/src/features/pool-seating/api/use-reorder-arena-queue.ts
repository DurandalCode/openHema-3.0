"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applyArenaState, unwrapArenaState } from "./arena-state-cache";
import { reorderArenaQueueRequest } from "./requests";

/**
 * useReorderArenaQueue — мутация «задать порядок очереди арены целиком»
 * (спека 0063, FR-6). Принимает полный упорядоченный список id пулов.
 */
export function useReorderArenaQueue(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolIds: string[]) =>
      unwrapArenaState(await reorderArenaQueueRequest(arenaId, poolIds)),
    onSuccess: (state) => applyArenaState(qc, arenaId, state),
  });
}
