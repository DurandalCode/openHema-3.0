"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitApplicationRequest } from "./requests";
import { myApplicationsKeys } from "./keys";

/**
 * useSubmitApplication — мутация подачи заявки в номинацию. При успехе
 * инвалидирует «мои заявки» (кабинет перечитает список при следующем заходе).
 */
export function useSubmitApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nominationId: string) => {
      const res = await submitApplicationRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myApplicationsKeys.list() });
    },
  });
}
