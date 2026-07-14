"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPoolRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/** useCreatePool — мутация создания пула в номинации (только draft, FR-3). */
export function useCreatePool(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await createPoolRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
