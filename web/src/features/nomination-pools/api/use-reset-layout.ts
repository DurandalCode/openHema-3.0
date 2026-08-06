"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resetLayoutRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useResetLayout — мутация сброса раскладки целиком: удалить все пулы,
 * вернуть всех бойцов в нераспределённые (только draft, FR-4a).
 */
export function useResetLayout(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await resetLayoutRequest(stageId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
    },
  });
}
