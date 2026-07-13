"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createArenaRequest, type ArenaInput } from "./requests";
import { arenaManagementKeys } from "./keys";

/**
 * useCreateArena — мутация создания площадки турнира. При успехе
 * инвалидирует ключ списка площадок турнира.
 */
export function useCreateArena(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ArenaInput) => {
      const res = await createArenaRequest(tournamentId, input);
      if (!res.ok) throw new Error(res.error);
      return res.arena;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arenaManagementKeys.list(tournamentId) });
    },
  });
}