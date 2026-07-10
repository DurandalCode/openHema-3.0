"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { confirmPaymentRequest } from "./requests";

/**
 * useConfirmPayment — мутация подтверждения оплаты заявки (секретарь/admin).
 * Инвалидирует все закешированные срезы сводного экрана (простое,
 * широкое invalidate — фильтров может быть много и держать их в актуальном
 * состоянии точечно не оправдано для admin-экрана).
 */
export function useConfirmPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await confirmPaymentRequest(applicationId);
      if (!res.ok) throw new Error(res.error);
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application-review"] });
    },
  });
}
