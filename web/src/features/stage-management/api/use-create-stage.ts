"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createStageRequest, type CreateStageInput } from "./requests";
import { stageManagementKeys } from "./keys";

/** useCreateStage — мутация добавления этапа-сетки в номинацию (FR-1/FR-2). */
export function useCreateStage(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStageInput) => {
      const res = await createStageRequest(nominationId, input);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stageManagementKeys.list(nominationId) });
    },
  });
}
