"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateNominationRequest, type NominationInput } from "./requests";
import { nominationManagementKeys } from "./keys";

/**
 * useUpdateNomination — мутация обновления номинации целиком. Инвалидирует
 * и список номинаций турнира (экран «Номинации»), и ключ одной номинации
 * (спека 0031, FR-2: инлайн-шапка экрана схемы читает `useNomination`) —
 * аддитивно, список не теряет свою инвалидацию.
 */
export function useUpdateNomination(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: NominationInput }) => {
      const res = await updateNominationRequest(id, input);
      if (!res.ok) throw new Error(res.error);
      return res.nomination;
    },
    onSuccess: (_nomination, variables) => {
      qc.invalidateQueries({ queryKey: nominationManagementKeys.list(tournamentId) });
      qc.invalidateQueries({ queryKey: nominationManagementKeys.one(variables.id) });
    },
  });
}
