"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reopenRegistrationRequest } from "./requests";
import { nominationManagementKeys } from "./keys";
import { registrationErrorMessage } from "./registration-gate";

/**
 * useReopenRegistration — мутация открытия приёма заявок обратно (спека
 * 0012, FR-3/FR-4). Кнопка в UI недоступна, когда клиентский гейт не
 * пропускает (`canReopen`, спека 0028), но мутация остаётся defensive —
 * сервер отклоняет `FailedPrecondition` (→ HTTP 409), если закрытие было не
 * ручным или сейчас есть распределённые бойцы (0012, FR-4). `res.status`
 * прокидывается через `registrationErrorMessage` (0028, FR-14/AC-11) —
 * единственное место, где 409 переводится в фиксированную русскую
 * формулировку вместо показа технической строки сервера.
 */
export function useReopenRegistration(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await reopenRegistrationRequest(id);
      if (!res.ok) throw new Error(registrationErrorMessage(res.error, res.status));
      return res.nomination;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationManagementKeys.list(tournamentId) });
    },
  });
}
