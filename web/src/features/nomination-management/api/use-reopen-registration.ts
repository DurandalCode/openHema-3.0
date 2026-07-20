"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reopenRegistrationRequest } from "./requests";
import { nominationManagementKeys } from "./keys";

/**
 * useReopenRegistration — мутация открытия приёма заявок обратно (спека
 * 0012, FR-3/FR-4). Сервер отклоняет `FailedPrecondition` (маппится в 409 →
 * `Error` с сообщением сервера), если закрытие было не ручным или раскладка
 * сейчас активна (AC-9/AC-16) — кнопка в UI и так недоступна в этом случае
 * (`canReopen`), но мутация остаётся defensive.
 */
export function useReopenRegistration(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await reopenRegistrationRequest(id);
      if (!res.ok) throw new Error(res.error);
      return res.nomination;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationManagementKeys.list(tournamentId) });
    },
  });
}
