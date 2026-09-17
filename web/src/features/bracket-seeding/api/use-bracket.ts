"use client";

import { useQuery } from "@tanstack/react-query";
import { getBracketRequest } from "./requests";
import { bracketSeedingKeys } from "./keys";
import { bracketErrorMessage } from "./errors";

/** useBracket — админский вид сетки этапа (посев + резолв, FR-7/FR-19). */
export function useBracket(stageId: string) {
  return useQuery({
    queryKey: bracketSeedingKeys.bracket(stageId),
    queryFn: async () => {
      const res = await getBracketRequest(stageId);
      if (!res.ok) throw new Error(bracketErrorMessage(res.error, res.status));
      return res.bracket;
    },
    enabled: stageId.length > 0,
  });
}
