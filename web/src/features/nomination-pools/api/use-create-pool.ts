"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPoolRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/** useCreatePool — мутация создания пула в этапе (только draft, FR-3). */
export function useCreatePool(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await createPoolRequest(stageId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
    },
  });
}
