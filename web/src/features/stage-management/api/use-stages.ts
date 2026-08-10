"use client";

import { useQuery } from "@tanstack/react-query";
import { listStagesRequest } from "./requests";
import { stageManagementKeys } from "./keys";

/**
 * useStages — список этапов номинации + диагностика схемы для клиентских
 * компонентов админки (FR-18; спека 0020, FR-8 — `issues` приезжает вместе
 * со списком, отдельного запроса нет).
 */
export function useStages(nominationId: string) {
  return useQuery({
    queryKey: stageManagementKeys.list(nominationId),
    queryFn: async () => {
      const res = await listStagesRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return { stages: res.stages, issues: res.issues };
    },
    enabled: nominationId.length > 0,
  });
}
