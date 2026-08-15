"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateTournamentRequest,
  type UpdateTournamentInput,
} from "./requests";
import { tournamentSettingsKeys } from "./keys";
import { tournamentErrorMessage } from "./errors";

/**
 * useUpdateTournament — мутация обновления профиля активного турнира.
 * Ошибка оборачивается в `tournamentErrorMessage(res.error, res.status)` до
 * `throw` — иначе HTTP-статус теряется на границе хука: `onError` видит
 * только `Error.message` (та же поправка, что в 0028/T9 для
 * `use-reopen-registration`). При успехе инвалидирует ключ активного
 * турнира (refetch в форме и инвалидация SSR-кеша главной при следующем
 * заходе).
 */
export function useUpdateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTournamentInput) => {
      const res = await updateTournamentRequest(input);
      if (!res.ok) throw new Error(tournamentErrorMessage(res.error, res.status));
      return res.tournament;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tournamentSettingsKeys.active });
    },
  });
}