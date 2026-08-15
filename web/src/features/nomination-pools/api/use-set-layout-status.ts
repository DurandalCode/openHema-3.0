"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setLayoutStatusRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";
import { poolsErrorMessage } from "./errors";

/**
 * useSetLayoutStatus — мутация переключения статуса раскладки draft↔ready
 * (FR-9). Переход в ready формирует бои (спека 0010), переход в draft их
 * удаляет — оба случая меняют результат `useBouts`, поэтому инвалидируем
 * оба ключа. Инвалидации одного `layout` недостаточно: `bouts` — отдельный
 * запрос с собственным кэшем (`staleTime: 60s`, `shared/lib/query-client.ts`),
 * и просто включение `enabled` при переходе в ready не рефетчит уже
 * закэшированные (пусть и устаревшие по составу) бои, пока не истечёт
 * staleTime.
 *
 * `bouts` остаётся адресован `nominationId` (спека 0018 не переносит эту
 * ручку на `stage_id`, см. `requests.ts`), который здесь недоступен —
 * инвалидируем по префиксу ключа (`["nomination-pools", "bouts"]`), это
 * задевает бои всех этапов, но экран раскладки рендерит один этап за раз.
 */
export function useSetLayoutStatus(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "draft" | "ready") => {
      const res = await setLayoutStatusRequest(stageId, status);
      if (!res.ok) throw new Error(poolsErrorMessage(res.error, res.status));
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
      qc.invalidateQueries({ queryKey: ["nomination-pools", "bouts"] });
    },
  });
}
