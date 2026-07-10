"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registerFighterRequest } from "./requests";

/**
 * useRegisterFighter — мутация регистрации оплаченной заявки (терминальный
 * шаг). Результат несёт capacityExceeded — мягкое предупреждение о
 * переполнении номинации, не блокирующее (FR-13).
 */
export function useRegisterFighter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await registerFighterRequest(applicationId);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application-review"] });
    },
  });
}
