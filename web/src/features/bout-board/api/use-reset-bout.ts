"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resetBoutRequest } from "./requests";
import { boutBoardKeys } from "./keys";

/**
 * useResetBout — сбросить начатый бой в «не начат» (спека 0013, FR-6): идёт
 * → не начат, счёт обнуляется. При успехе инвалидирует доску этой арены.
 */
export function useResetBout(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await resetBoutRequest(poolId);
      if (!res.ok) throw new Error(res.error);
      return res.board;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boutBoardKeys.board(arenaId) });
    },
  });
}
