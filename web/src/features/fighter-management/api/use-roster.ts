"use client";

import { useQuery } from "@tanstack/react-query";
import { listRosterRequest } from "./requests";
import { fighterManagementKeys } from "./keys";

/**
 * useRoster — ростер турнира (бойцы + участия + статусы), admin.
 *
 * refetchOnMount: "always" — боец чаще всего появляется через кроссдоменный
 * эффект регистрации заявки на другой странице (application-review), о
 * котором этот кеш ничего не знает и который некому инвалидировать. Без
 * этого при переходе на /admin/fighters клиентским роутером (без полной
 * перезагрузки) показывался устаревший список до истечения staleTime.
 */
export function useRoster(tournamentId: string) {
  return useQuery({
    queryKey: fighterManagementKeys.roster(tournamentId),
    queryFn: async () => {
      const res = await listRosterRequest(tournamentId);
      if (!res.ok) throw new Error(res.error);
      return res.fighters;
    },
    enabled: tournamentId.length > 0,
    refetchOnMount: "always",
  });
}
