"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { seatPoolRequest } from "./requests";
import { poolSeatingKeys } from "./keys";

/**
 * useSeatPool — мутация постановки готового пула на арену (спека 0011,
 * FR-7). При успехе инвалидирует `for-arena`-ключ этой арены (пул стал
 * `seated`, список `available` сузился).
 */
export function useSeatPool(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await seatPoolRequest(poolId, arenaId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poolSeatingKeys.forArena(arenaId) });
    },
  });
}
