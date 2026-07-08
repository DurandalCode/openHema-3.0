"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateTournamentRequest,
  type UpdateTournamentInput,
} from "./requests";
import { tournamentSettingsKeys } from "./keys";

/**
 * useUpdateTournament — мутация обновления профиля активного турнира.
 * При успехе инвалидирует ключ активного турнира (refetch в форме и
 * инвалидация SSR-кеша главной при следующем заходе).
 */
export function useUpdateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTournamentInput) => {
      const res = await updateTournamentRequest(input);
      if (!res.ok) throw new Error(res.error);
      return res.tournament;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tournamentSettingsKeys.active });
    },
  });
}