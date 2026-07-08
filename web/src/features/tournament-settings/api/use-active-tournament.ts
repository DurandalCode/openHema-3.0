"use client";

import { useQuery } from "@tanstack/react-query";
import { getActiveTournamentRequest } from "./requests";
import { tournamentSettingsKeys } from "./keys";

/** useActiveTournament — активный турнир для клиентских компонентов
 * (форма настроек). Главная страница использует server-side
 * `getActiveTournament`, здесь — для refetch после правок. */
export function useActiveTournament() {
  return useQuery({
    queryKey: tournamentSettingsKeys.active,
    queryFn: async () => {
      const res = await getActiveTournamentRequest();
      if (!res.ok) throw new Error(res.error);
      return res.tournament;
    },
  });
}