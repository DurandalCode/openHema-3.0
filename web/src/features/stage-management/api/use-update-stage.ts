"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateStageRequest, type UpdateStageInput } from "./requests";
import { stageManagementKeys } from "./keys";

/**
 * useUpdateStage — мутация правки уже созданного этапа (спека 0020, FR-2):
 * название всегда, конфиг — пока состав пуст и этап в черновике (сервер
 * отклоняет иначе — `ErrStageLocked`, AC-2). Список этапов номинации несёт
 * конфиг каждого этапа (`GET /api/nominations/[id]/stages`), поэтому
 * инвалидируем тот же ключ, что и остальные мутации фичи.
 */
export function useUpdateStage(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { stageId: string; input: UpdateStageInput }) => {
      const res = await updateStageRequest(vars.stageId, vars.input);
      if (!res.ok) throw new Error(res.error);
      return res.stage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stageManagementKeys.list(nominationId) });
    },
  });
}
