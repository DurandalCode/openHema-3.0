"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setLayoutStatusRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useSetLayoutStatus — мутация переключения статуса раскладки draft↔ready
 * (FR-9).
 */
export function useSetLayoutStatus(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "draft" | "ready") => {
      const res = await setLayoutStatusRequest(nominationId, status);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
