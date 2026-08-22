"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { declarePaymentRequest } from "./requests";
import { myApplicationsKeys } from "./keys";
import { ApplicationRequestError } from "./mutation-error";

/** useDeclarePayment — мутация отметки оплаты собственной заявки. */
export function useDeclarePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await declarePaymentRequest(applicationId);
      if (!res.ok) throw new ApplicationRequestError(res.error, res.status);
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myApplicationsKeys.list() });
    },
  });
}
