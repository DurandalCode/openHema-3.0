"use client";

import { useQuery } from "@tanstack/react-query";
import { listApplicationsOverviewRequest, type OverviewFilters } from "./requests";
import { applicationReviewKeys } from "./keys";

/**
 * useApplicationsOverview — сводный экран заявок турнира (admin). Серверные
 * поиск/фильтр/постраничность (спека 0041): query key несёт весь фильтр и
 * страницу — смена любого параметра сама рефетчит нужный срез, отдельной
 * инвалидации не нужно (план 0041, «Web»).
 *
 * Возвращает распакованные `applications`/`totalCount`/`statusCounts`
 * (страница + навигация + счётчики по всему турниру, не зависящие от
 * фильтра — FR-4) поверх обычного результата `useQuery` (`isLoading`,
 * `error`, `refetch`, ...).
 */
export function useApplicationsOverview(tournamentId: string, filters: OverviewFilters) {
  const statuses = filters.statuses ? Array.from(filters.statuses) : [];
  const nominationIds = filters.nominationIds ? Array.from(filters.nominationIds) : [];
  const needsEquipment = filters.needsEquipment ?? false;
  const search = filters.search?.trim() ?? "";

  const query = useQuery({
    queryKey: applicationReviewKeys.overview(
      tournamentId,
      statuses,
      nominationIds,
      needsEquipment,
      search,
      filters.page,
      filters.pageSize,
    ),
    queryFn: async () => {
      const res = await listApplicationsOverviewRequest(tournamentId, filters);
      if (!res.ok) throw new Error(res.error);
      return {
        applications: res.applications,
        totalCount: res.totalCount,
        statusCounts: res.statusCounts,
      };
    },
    enabled: tournamentId.length > 0,
  });

  return {
    ...query,
    applications: query.data?.applications ?? [],
    totalCount: query.data?.totalCount ?? 0,
    statusCounts: query.data?.statusCounts ?? [],
  };
}
