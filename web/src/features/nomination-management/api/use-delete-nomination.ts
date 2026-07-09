"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteNominationRequest } from "./requests";
import { nominationManagementKeys } from "./keys";

/** useDeleteNomination — мутация удаления номинации. */
export function useDeleteNomination(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteNominationRequest(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationManagementKeys.list(tournamentId) });
    },
  });
}
