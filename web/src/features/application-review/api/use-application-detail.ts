"use client";

import { useQuery } from "@tanstack/react-query";
import { getApplicationRequest } from "./requests";
import { applicationReviewKeys } from "./keys";

/**
 * useApplicationDetail — заявка с историей событий для карточки заявки
 * (spec FR-16/FR-20): запрашивается отдельно от сводного списка, только
 * когда карточка открыта — `enabled` включается лишь при переданном
 * (истинном) `applicationId`, чтобы открытие/закрытие карточки управляло
 * запросом, а не сотня строк списка тянула историю каждой заявки.
 */
export function useApplicationDetail(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: applicationReviewKeys.detail(applicationId ?? ""),
    queryFn: async () => {
      const res = await getApplicationRequest(applicationId as string);
      if (!res.ok) throw new Error(res.error);
      return { application: res.application, history: res.history };
    },
    enabled: Boolean(applicationId),
  });
}
