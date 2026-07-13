"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { editApplicationRequest, type EditApplicationInput } from "./requests";

/**
 * useEditApplication — мутация правки заявки админом: клуб, признак
 * экипировки, переопределение имени, перенос номинации и/или ручная смена
 * статуса (спека 0006, FR-3..FR-9). Инвалидирует все закешированные срезы
 * сводного экрана (как confirmPayment/registerFighter).
 */
export function useEditApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      applicationId,
      ...input
    }: { applicationId: string } & EditApplicationInput) => {
      const res = await editApplicationRequest(applicationId, input);
      if (!res.ok) throw new Error(res.error);
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application-review"] });
    },
  });
}
