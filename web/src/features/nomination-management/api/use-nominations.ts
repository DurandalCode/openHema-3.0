"use client";

import { useQuery } from "@tanstack/react-query";
import { listNominationsRequest } from "./requests";
import { nominationManagementKeys } from "./keys";

/** useNominations — номинации турнира для клиентских компонентов админки. */
export function useNominations(tournamentId: string) {
  return useQuery({
    queryKey: nominationManagementKeys.list(tournamentId),
    queryFn: async () => {
      const res = await listNominationsRequest(tournamentId);
      if (!res.ok) throw new Error(res.error);
      return res.nominations;
    },
    enabled: tournamentId.length > 0,
  });
}
