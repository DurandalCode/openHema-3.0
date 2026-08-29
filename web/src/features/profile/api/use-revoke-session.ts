"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revokeSessionRequest } from "./requests";
import { profileKeys } from "./keys";

/**
 * useRevokeSession — мутация завершения одной сессии из списка (спека
 * 0042, FR-12). Инвалидирует список сессий на успехе — карточка сразу
 * теряет отозванную запись.
 */
export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await revokeSessionRequest(id);
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.sessions });
    },
  });
}
