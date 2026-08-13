"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registerFighterRequest } from "./requests";
import { applicationReviewKeys } from "./keys";

/**
 * useRegisterFighter — мутация регистрации оплаченной заявки (терминальный
 * шаг). Результат несёт capacityExceeded — мягкое предупреждение о
 * переполнении номинации, не блокирующее (FR-13). Инвалидирует сводный
 * экран и явно — `detail`-ключ этой заявки, чтобы открытая карточка
 * обновилась (spec FR-21).
 */
export function useRegisterFighter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await registerFighterRequest(applicationId);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (_result, applicationId) => {
      qc.invalidateQueries({ queryKey: ["application-review"] });
      qc.invalidateQueries({ queryKey: applicationReviewKeys.detail(applicationId) });
    },
  });
}
