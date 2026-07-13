"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateArenaRequest, type ArenaInput } from "./requests";
import { arenaManagementKeys } from "./keys";

/**
 * useUpdateArena — мутация правки name/description площадки. При успехе
 * инвалидирует ключ списка и detail-ключ этой площадки.
 */
export function useUpdateArena(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; input: ArenaInput }) => {
      const res = await updateArenaRequest(args.id, args.input);
      if (!res.ok) throw new Error(res.error);
      return res.arena;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: arenaManagementKeys.list(tournamentId) });
      qc.invalidateQueries({ queryKey: arenaManagementKeys.detail(vars.id) });
    },
  });
}