"use client";

import { useQuery } from "@tanstack/react-query";
import { listArenasRequest } from "./requests";
import { arenaManagementKeys } from "./keys";

/** useArenas — площадки турнира для клиентских компонентов админки. */
export function useArenas(tournamentId: string) {
  return useQuery({
    queryKey: arenaManagementKeys.list(tournamentId),
    queryFn: async () => {
      const res = await listArenasRequest(tournamentId);
      if (!res.ok) throw new Error(res.error);
      return res.arenas;
    },
    enabled: tournamentId.length > 0,
  });
}