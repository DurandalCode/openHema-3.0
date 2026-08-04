"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteStageRequest } from "./requests";
import { stageManagementKeys } from "./keys";

/**
 * useDeleteStage — мутация удаления этапа-сетки (AC-14): гейты «только
 * сетка» и «нет начатых боёв» проверяет сервер, клиент показывает его
 * ошибку.
 */
export function useDeleteStage(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stageId: string) => {
      const res = await deleteStageRequest(stageId);
      if (!res.ok) throw new Error(res.error);
      return res.stages;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stageManagementKeys.list(nominationId) });
    },
  });
}
