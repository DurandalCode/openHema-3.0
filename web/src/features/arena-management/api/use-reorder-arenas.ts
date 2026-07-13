"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderArenasRequest } from "./requests";
import { arenaManagementKeys } from "./keys";

/**
 * useReorderArenas — мутация задания порядка площадок турнира. При успехе
 * инвалидирует ключ списка.
 */
export function useReorderArenas(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await reorderArenasRequest(tournamentId, orderedIds);
      if (!res.ok) throw new Error(res.error);
      return res.arenas;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arenaManagementKeys.list(tournamentId) });
    },
  });
}