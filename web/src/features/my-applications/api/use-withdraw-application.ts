"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { withdrawApplicationRequest } from "./requests";
import { myApplicationsKeys } from "./keys";

/** useWithdrawApplication — мутация отзыва собственной заявки. */
export function useWithdrawApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await withdrawApplicationRequest(applicationId);
      if (!res.ok) throw new Error(res.error);
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myApplicationsKeys.list() });
    },
  });
}
