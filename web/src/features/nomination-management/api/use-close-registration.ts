"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { closeRegistrationRequest } from "./requests";
import { nominationManagementKeys } from "./keys";

/**
 * useCloseRegistration — мутация ручного закрытия приёма заявок номинации
 * (спека 0012, FR-3). Инвалидирует список номинаций турнира — статус
 * (и, следом, доступность кнопок) должен обновиться сразу.
 */
export function useCloseRegistration(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await closeRegistrationRequest(id);
      if (!res.ok) throw new Error(res.error);
      return res.nomination;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationManagementKeys.list(tournamentId) });
    },
  });
}
