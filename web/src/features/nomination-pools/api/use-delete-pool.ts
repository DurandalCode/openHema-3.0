"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePoolRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useDeletePool — мутация удаления пула; его бойцы возвращаются в
 * нераспределённые (только draft, undoable — FR-4/FR-7a).
 */
export function useDeletePool(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await deletePoolRequest(poolId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
