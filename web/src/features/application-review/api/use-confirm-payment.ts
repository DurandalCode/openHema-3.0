"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { confirmPaymentRequest } from "./requests";
import { applicationReviewKeys } from "./keys";

/**
 * useConfirmPayment — мутация подтверждения оплаты заявки (секретарь/admin).
 * Инвалидирует все закешированные срезы сводного экрана (простое,
 * широкое invalidate — фильтров может быть много и держать их в актуальном
 * состоянии точечно не оправдано для admin-экрана), плюс явно —
 * `detail`-ключ этой заявки, чтобы открытая карточка обновилась (spec FR-21).
 */
export function useConfirmPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await confirmPaymentRequest(applicationId);
      if (!res.ok) throw new Error(res.error);
      return res.application;
    },
    onSuccess: (_application, applicationId) => {
      qc.invalidateQueries({ queryKey: ["application-review"] });
      qc.invalidateQueries({ queryKey: applicationReviewKeys.detail(applicationId) });
    },
  });
}
