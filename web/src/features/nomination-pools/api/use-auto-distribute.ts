"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { autoDistributeRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";
import { poolsErrorMessage } from "./errors";

/**
 * useAutoDistribute — мутация «Распределить автоматически»:
 * автораспределение нераспределённых бойцов по существующим пулам,
 * минимизируя одноклубников (FR-6/FR-7 спеки 0009). Только draft, undoable
 * (0009 FR-7a). Тост с «Отменить» вызывается компонентом (спека 0030,
 * FR-5) — хук не знает про `useUndo`. Отказ переводится на русский по
 * HTTP-статусу прямо в `mutationFn`.
 */
export function useAutoDistribute(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await autoDistributeRequest(stageId);
      if (!res.ok) throw new Error(poolsErrorMessage(res.error, res.status));
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
    },
  });
}
