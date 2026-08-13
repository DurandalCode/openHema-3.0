"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setArenaDefaultDurationRequest } from "./requests";
import { arenaManagementKeys } from "./keys";

/**
 * useSetDefaultDuration — мутация дефолтной длительности боя площадки
 * (спека 0015/0027, FR-12). При успехе инвалидирует ключ списка и
 * detail-ключ этой площадки.
 */
export function useSetDefaultDuration(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; seconds: number }) => {
      const res = await setArenaDefaultDurationRequest(args.id, args.seconds);
      if (!res.ok) throw new Error(res.error);
      return res.arena;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: arenaManagementKeys.list(tournamentId) });
      qc.invalidateQueries({ queryKey: arenaManagementKeys.detail(vars.id) });
    },
  });
}
