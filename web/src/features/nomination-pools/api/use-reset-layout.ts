"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resetLayoutRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";
import { poolsErrorMessage } from "./errors";

/**
 * useResetLayout — мутация сброса раскладки целиком: удалить все пулы,
 * вернуть всех бойцов в нераспределённые (только draft, FR-4a). Отказ
 * переводится на русский по HTTP-статусу прямо в `mutationFn` (как в
 * `use-undo.ts`) — вызывающая сторона показывает готовый `err.message`.
 */
export function useResetLayout(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await resetLayoutRequest(stageId);
      if (!res.ok) throw new Error(poolsErrorMessage(res.error, res.status));
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
    },
  });
}
