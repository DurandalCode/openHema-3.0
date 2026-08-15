"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toastSuccess } from "@/shared/lib/toast";
import { createPoolRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";
import { poolsErrorMessage } from "./errors";

/**
 * useCreatePool — мутация создания пула в этапе (только draft, FR-3).
 * Отказ переводится на русский по HTTP-статусу (спека 0030, FR-3) прямо в
 * `mutationFn`, поэтому `onError` компонента видит уже русский
 * `err.message`.
 */
export function useCreatePool(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await createPoolRequest(stageId);
      if (!res.ok) throw new Error(poolsErrorMessage(res.error, res.status));
      return res.layout;
    },
    onSuccess: () => {
      toastSuccess("Пул создан");
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
    },
  });
}
