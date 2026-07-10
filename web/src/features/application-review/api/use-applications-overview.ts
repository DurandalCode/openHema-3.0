"use client";

import { useQuery } from "@tanstack/react-query";
import { listApplicationsOverviewRequest, type OverviewFilters } from "./requests";
import { applicationReviewKeys } from "./keys";

/**
 * useApplicationsOverview — сводный экран заявок турнира (admin) с
 * опциональными фильтрами по статусу и/или номинации (FR-14).
 */
export function useApplicationsOverview(tournamentId: string, filters: OverviewFilters) {
  return useQuery({
    queryKey: applicationReviewKeys.overview(
      tournamentId,
      filters.status ?? null,
      filters.nominationId ?? null,
    ),
    queryFn: async () => {
      const res = await listApplicationsOverviewRequest(tournamentId, filters);
      if (!res.ok) throw new Error(res.error);
      return res.applications;
    },
    enabled: tournamentId.length > 0,
  });
}
