"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { undoRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";
import { poolsErrorMessage } from "./errors";

/**
 * useUndo — мутация «Отменить»: откат последнего mutating-действия
 * (автораспределение, удаление пула или сброс раскладки, 0009 FR-7a).
 * Только draft. Используется и кнопкой тулбара, и как `onUndo` тостов
 * FR-4/FR-5/FR-6 (спека 0030) — в обоих случаях один и тот же хук. Успех —
 * без тоста (результат виден по раскладке, спека 0030 FR-7); отказ
 * переводится на русский по HTTP-статусу прямо в `mutationFn`, тост-ошибку
 * зовёт вызывающая сторона.
 */
export function useUndo(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await undoRequest(stageId);
      if (!res.ok) throw new Error(poolsErrorMessage(res.error, res.status));
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
    },
  });
}
