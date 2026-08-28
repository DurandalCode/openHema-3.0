"use client";

import { useQuery } from "@tanstack/react-query";
import { FULL_ROSTER_LIMIT, listRosterRequest } from "./requests";
import { fighterManagementKeys } from "./keys";

/**
 * useFullRoster — весь ростер турнира без фильтра, одним запросом с
 * большим `limit` (спека 0041, план «Риски» — см. `FULL_ROSTER_LIMIT` в
 * `requests.ts`). Источник для трёх мест экрана, которым нужен весь
 * ростер, а не отфильтрованная страница `useRoster`:
 *  - выпадающий список клубов (`clubOptions`, 0026 FR-9);
 *  - шапка раздела («N бойцов»), спека 0026 FR-23;
 *  - `MergeFightersDialog`/`FighterCardDialog`, открытая по id, найденному
 *    через «Найти по учётке» (FR-9, спека 0040) — этот id может не входить
 *    в текущую отфильтрованную страницу.
 *
 * refetchOnMount: "always" — та же причина, что у `useRoster`.
 */
export function useFullRoster(tournamentId: string) {
  return useQuery({
    queryKey: fighterManagementKeys.fullRoster(tournamentId),
    queryFn: async () => {
      const res = await listRosterRequest(tournamentId, { page: 1, pageSize: FULL_ROSTER_LIMIT });
      if (!res.ok) throw new Error(res.error);
      return res.fighters;
    },
    enabled: tournamentId.length > 0,
    refetchOnMount: "always",
  });
}
