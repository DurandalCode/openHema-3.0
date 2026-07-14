"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { autoDistributeRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useAutoDistribute — мутация «Распределить по группам»: автораспределение
 * нераспределённых бойцов по существующим пулам, минимизируя
 * одноклубников (FR-6/FR-7). Только draft, undoable.
 */
export function useAutoDistribute(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await autoDistributeRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
