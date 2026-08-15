"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePoolRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";
import { poolsErrorMessage } from "./errors";

/**
 * useDeletePool — мутация удаления пула; его бойцы возвращаются в
 * нераспределённые (только draft, undoable — FR-4/FR-7a спеки 0009).
 * Выполняется без модалки подтверждения (спека 0030, FR-4: покрыто общим
 * undo-слотом, тем же паттерном, что архивация площадки в 0027) — тост с
 * «Отменить» вызывается компонентом (`nomination-pools.tsx`), не здесь: хук
 * не знает про `useUndo`. Отказ переводится на русский по HTTP-статусу
 * прямо в `mutationFn`.
 */
export function useDeletePool(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (poolId: string) => {
      const res = await deletePoolRequest(poolId);
      if (!res.ok) throw new Error(poolsErrorMessage(res.error, res.status));
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
    },
  });
}
