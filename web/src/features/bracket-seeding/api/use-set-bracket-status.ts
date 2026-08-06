"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setStatusRequest } from "./requests";
import { bracketSeedingKeys } from "./keys";

/**
 * useSetBracketStatus — мутация фиксации/расфиксации посева draft↔ready
 * (FR-10). Гейт «меньше двух посеянных» (FR-11) проверяет сервер
 * (`ErrNotEnoughSeeds`) — клиент не считает посев заранее, только показывает
 * ошибку мутации.
 */
export function useSetBracketStatus(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "draft" | "ready") => {
      const res = await setStatusRequest(stageId, status);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
    },
  });
}
