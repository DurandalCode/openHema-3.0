"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderNominationsRequest } from "./requests";
import { nominationManagementKeys } from "./keys";

/** useReorderNominations — мутация порядка номинаций турнира целиком. */
export function useReorderNominations(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await reorderNominationsRequest(tournamentId, orderedIds);
      if (!res.ok) throw new Error(res.error);
      return res.nominations;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationManagementKeys.list(tournamentId) });
    },
  });
}
