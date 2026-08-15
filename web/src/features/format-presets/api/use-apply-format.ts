"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { stageManagementKeys } from "@/features/stage-management/api/keys";
import { applyFormatRequest, type ApplyFormatSource } from "./requests";
import { presetErrorMessage } from "./errors";

/**
 * useApplyFormat — применение формата к номинации (спека 0020, FR-13/FR-15):
 * пресет из библиотеки либо схема номинации-донора. Заменяет схему целиком
 * (NFR-1), поэтому инвалидирует список этапов номинации — тот же ключ, что
 * читает `features/stage-management`. Кросс-фичевый импорт `keys.ts`
 * допустим: это чистые данные без бизнес-логики, границы FSD не нарушены.
 * `res.status` прокидывается через `presetErrorMessage(..., "apply")` (спека
 * 0031, FR-27): 409 здесь означает тронутую схему номинации, а не конфликт
 * имени пресета — другой текст, чем у переименования/удаления.
 */
export function useApplyFormat(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: ApplyFormatSource) => {
      const res = await applyFormatRequest(nominationId, source);
      if (!res.ok) throw new Error(presetErrorMessage(res.error, res.status, "apply"));
      return res.stages;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stageManagementKeys.list(nominationId) });
    },
  });
}
