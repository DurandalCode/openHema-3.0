"use client";

import { useQuery } from "@tanstack/react-query";
import { getLayoutRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/** useLayout — раскладка номинации по пулам для клиентских компонентов админки. */
export function useLayout(nominationId: string) {
  return useQuery({
    queryKey: nominationPoolsKeys.layout(nominationId),
    queryFn: async () => {
      const res = await getLayoutRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    enabled: nominationId.length > 0,
  });
}
