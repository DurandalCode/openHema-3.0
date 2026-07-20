"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { scoreBoutRequest } from "./requests";
import { boutBoardKeys } from "./keys";

/**
 * useScoreBout — задать абсолютный счёт текущего боя (спека 0013, FR-2/
 * FR-2a): и быстрые шаги, и ручной ввод сводятся к одной паре чисел на
 * клиенте (`model/score-step.ts`), сюда шлётся только итог. При успехе
 * инвалидирует доску этой арены.
 */
export function useScoreBout(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      poolId,
      scoreA,
      scoreB,
    }: {
      poolId: string;
      scoreA: number;
      scoreB: number;
    }) => {
      const res = await scoreBoutRequest(poolId, scoreA, scoreB);
      if (!res.ok) throw new Error(res.error);
      return res.board;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boutBoardKeys.board(arenaId) });
    },
  });
}
