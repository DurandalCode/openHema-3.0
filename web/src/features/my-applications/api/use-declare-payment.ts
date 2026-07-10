"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { declarePaymentRequest } from "./requests";
import { myApplicationsKeys } from "./keys";

/** useDeclarePayment — мутация отметки оплаты собственной заявки. */
export function useDeclarePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await declarePaymentRequest(applicationId);
      if (!res.ok) throw new Error(res.error);
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myApplicationsKeys.list() });
    },
  });
}
