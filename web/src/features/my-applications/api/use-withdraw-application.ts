"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { withdrawApplicationRequest } from "./requests";
import { myApplicationsKeys } from "./keys";
import { ApplicationRequestError } from "./mutation-error";

/** useWithdrawApplication — мутация отзыва собственной заявки. */
export function useWithdrawApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await withdrawApplicationRequest(applicationId);
      if (!res.ok) throw new ApplicationRequestError(res.error, res.status);
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myApplicationsKeys.list() });
    },
  });
}
