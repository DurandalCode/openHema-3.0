"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setCurrentBoutRequest } from "./requests";
import { boutBoardKeys } from "./keys";

/**
 * useSetCurrentBout — циркуляция по пулу (спека 0013, FR-8): назначить
 * текущим любой бой пула, включая уже завершённый. При успехе инвалидирует
 * доску этой арены.
 */
export function useSetCurrentBout(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, boutId }: { poolId: string; boutId: string }) => {
      const res = await setCurrentBoutRequest(poolId, boutId);
      if (!res.ok) throw new Error(res.error);
      return res.board;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boutBoardKeys.board(arenaId) });
    },
  });
}
