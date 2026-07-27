"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reopenBoutRequest } from "./requests";
import { boutBoardKeys } from "./keys";

/**
 * useReopenBout — переоткрыть завершённый бой для правки счёта (спека 0013,
 * FR-6): завершён → идёт. При успехе инвалидирует доску этой арены.
 */
export function useReopenBout(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await reopenBoutRequest(poolId);
      if (!res.ok) throw new Error(res.error);
      return res.board;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boutBoardKeys.board(arenaId) });
    },
  });
}
