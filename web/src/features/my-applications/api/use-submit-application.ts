"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitApplicationRequest, type SubmitApplicationDetails } from "./requests";
import { myApplicationsKeys } from "./keys";
import { ApplicationRequestError } from "./mutation-error";

/**
 * useSubmitApplication — мутация подачи заявки в номинацию (клуб и признак
 * экипировки — опциональные доп. поля, спека 0006). При успехе инвалидирует
 * «мои заявки» (кабинет перечитает список при следующем заходе).
 */
export function useSubmitApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      nominationId,
      ...details
    }: { nominationId: string } & SubmitApplicationDetails) => {
      const res = await submitApplicationRequest(nominationId, details);
      if (!res.ok) throw new ApplicationRequestError(res.error, res.status);
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myApplicationsKeys.list() });
    },
  });
}
