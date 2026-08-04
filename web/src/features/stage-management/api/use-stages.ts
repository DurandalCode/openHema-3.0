"use client";

import { useQuery } from "@tanstack/react-query";
import { listStagesRequest } from "./requests";
import { stageManagementKeys } from "./keys";

/** useStages — список этапов номинации для клиентских компонентов админки (FR-18). */
export function useStages(nominationId: string) {
  return useQuery({
    queryKey: stageManagementKeys.list(nominationId),
    queryFn: async () => {
      const res = await listStagesRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.stages;
    },
    enabled: nominationId.length > 0,
  });
}
