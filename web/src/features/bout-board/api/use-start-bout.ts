"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startBoutRequest } from "./requests";
import { boutBoardKeys } from "./keys";

/**
 * useStartBout — начать текущий бой пула (спека 0013, FR-4): не начат →
 * идёт. При успехе инвалидирует доску этой арены.
 */
export function useStartBout(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await startBoutRequest(poolId);
      if (!res.ok) throw new Error(res.error);
      return res.board;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boutBoardKeys.board(arenaId) });
    },
  });
}
