"use client";

import { useQuery } from "@tanstack/react-query";
import { getBoutsForNominationRequest } from "./requests";
import { poolSeatingKeys } from "./keys";

/**
 * useBoutsForNomination — бои номинации владеющей пулом, стоящим на арене
 * (спека 0011, FR-9): показать бои пула по порядку рядом с постановкой.
 * Включён только когда известна номинация (пул сейчас на арене).
 */
export function useBoutsForNomination(nominationId: string) {
  return useQuery({
    queryKey: poolSeatingKeys.bouts(nominationId),
    queryFn: async () => {
      const res = await getBoutsForNominationRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.bouts;
    },
    enabled: nominationId.length > 0,
  });
}
