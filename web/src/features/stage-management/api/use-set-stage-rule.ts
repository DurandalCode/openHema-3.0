"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setStageRuleRequest, type SeedingRuleInput } from "./requests";
import { stageManagementKeys } from "./keys";

/**
 * useSetStageRule — мутация задать/снять правило отбора этапа отдельно от
 * создания (0019, FR-6): правило можно менять, пока состав этапа пуст
 * (AC-16) — гейт проверяет сервер, клиент показывает его ошибку.
 * `rule = null` снимает правило (этап снова набирается руками).
 */
export function useSetStageRule(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { stageId: string; rule: SeedingRuleInput | null }) => {
      const res = await setStageRuleRequest(vars.stageId, vars.rule);
      if (!res.ok) throw new Error(res.error);
      return res.stage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stageManagementKeys.list(nominationId) });
    },
  });
}
