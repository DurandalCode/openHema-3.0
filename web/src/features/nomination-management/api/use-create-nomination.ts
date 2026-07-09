"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createNominationRequest, type NominationInput } from "./requests";
import { nominationManagementKeys } from "./keys";

/**
 * useCreateNomination — мутация создания номинации турнира. При успехе
 * инвалидирует ключ списка номинаций турнира (refetch в списке и SSR-кеш
 * публичной страницы при следующем заходе).
 */
export function useCreateNomination(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NominationInput) => {
      const res = await createNominationRequest(tournamentId, input);
      if (!res.ok) throw new Error(res.error);
      return res.nomination;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationManagementKeys.list(tournamentId) });
    },
  });
}
