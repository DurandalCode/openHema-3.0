"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { finishBoutRequest } from "./requests";
import { boutBoardKeys } from "./keys";

/**
 * useFinishBout — завершить текущий бой пула (спека 0013, FR-5): идёт →
 * завершён, фиксирует счёт; сервер автоматически продвигает текущий бой на
 * следующий непроведённый (FR-9). При успехе инвалидирует доску этой арены.
 */
export function useFinishBout(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await finishBoutRequest(poolId);
      if (!res.ok) throw new Error(res.error);
      return res.board;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boutBoardKeys.board(arenaId) });
    },
  });
}
