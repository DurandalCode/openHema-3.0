"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setLayoutStatusRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useSetLayoutStatus — мутация переключения статуса раскладки draft↔ready
 * (FR-9). Переход в ready формирует бои (спека 0010), переход в draft их
 * удаляет — оба случая меняют результат `useBouts`, поэтому инвалидируем
 * оба ключа. Инвалидации одного `layout` недостаточно: `bouts` — отдельный
 * запрос с собственным кэшем (`staleTime: 60s`, `shared/lib/query-client.ts`),
 * и просто включение `enabled` при переходе в ready не рефетчит уже
 * закэшированные (пусть и устаревшие по составу) бои, пока не истечёт
 * staleTime.
 */
export function useSetLayoutStatus(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "draft" | "ready") => {
      const res = await setLayoutStatusRequest(nominationId, status);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.bouts(nominationId) });
    },
  });
}
