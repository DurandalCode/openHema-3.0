"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { archiveArenaRequest } from "./requests";
import { arenaManagementKeys } from "./keys";

/**
 * useArchiveArena — мутация архивации площадки. При успехе инвалидирует
 * ключ списка и detail-ключ площадки.
 */
export function useArchiveArena(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await archiveArenaRequest(id);
      if (!res.ok) throw new Error(res.error);
      return res.arena;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: arenaManagementKeys.list(tournamentId) });
      qc.invalidateQueries({ queryKey: arenaManagementKeys.detail(id) });
    },
  });
}