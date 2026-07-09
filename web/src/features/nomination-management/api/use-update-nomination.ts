"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateNominationRequest, type NominationInput } from "./requests";
import { nominationManagementKeys } from "./keys";

/** useUpdateNomination — мутация обновления номинации целиком. */
export function useUpdateNomination(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: NominationInput }) => {
      const res = await updateNominationRequest(id, input);
      if (!res.ok) throw new Error(res.error);
      return res.nomination;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationManagementKeys.list(tournamentId) });
    },
  });
}
