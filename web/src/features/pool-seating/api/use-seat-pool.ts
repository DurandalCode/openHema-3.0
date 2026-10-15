"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { seatPoolRequest } from "./requests";
import { poolSeatingKeys } from "./keys";

/**
 * useSeatPool — мутация постановки готового пула на арену (спека 0011,
 * FR-7). При успехе инвалидирует кэши всех арен: пул стал `seated`, список
 * `available` сузился, а пул мог стоять в очереди (этой или другой арены) и
 * по спеке 0063 (FR-10) из неё убирается.
 */
export function useSeatPool(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await seatPoolRequest(poolId, arenaId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poolSeatingKeys.allForArenas });
    },
  });
}
