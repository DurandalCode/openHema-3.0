"use client";

import { useQuery } from "@tanstack/react-query";
import { getMyApplicationRequest } from "./requests";
import { myApplicationsKeys } from "./keys";

/**
 * useApplicationDetail — заявка с историей событий для диалога деталей
 * заявки заявителя (спека 0040, FR-12/FR-13): запрашивается отдельно от
 * сводного списка, только когда диалог открыт — `enabled` включается лишь
 * при переданном (истинном) `applicationId`, тот же приём, что у
 * `application-review/api/use-application-detail.ts` (admin).
 */
export function useApplicationDetail(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: myApplicationsKeys.detail(applicationId ?? ""),
    queryFn: async () => {
      const res = await getMyApplicationRequest(applicationId as string);
      if (!res.ok) throw new Error(res.error);
      return { application: res.application, history: res.history };
    },
    enabled: Boolean(applicationId),
  });
}
