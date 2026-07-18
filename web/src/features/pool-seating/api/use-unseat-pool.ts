"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unseatPoolRequest } from "./requests";
import { poolSeatingKeys } from "./keys";

/**
 * useUnseatPool — мутация снятия пула с арены (спека 0011, FR-8). При
 * успехе инвалидирует `for-arena`-ключ этой арены (площадка освобождается,
 * пул возвращается в `available`).
 */
export function useUnseatPool(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await unseatPoolRequest(poolId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poolSeatingKeys.forArena(arenaId) });
    },
  });
}
