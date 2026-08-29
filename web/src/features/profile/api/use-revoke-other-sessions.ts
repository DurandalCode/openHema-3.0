"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revokeOtherSessionsRequest } from "./requests";
import { profileKeys } from "./keys";

/**
 * useRevokeOtherSessions — мутация «выйти со всех устройств» (спека 0042,
 * FR-12). Инвалидирует список сессий на успехе.
 */
export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await revokeOtherSessionsRequest();
      if (!result.ok) throw new Error(result.error);
      return result.revokedCount;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.sessions });
    },
  });
}
