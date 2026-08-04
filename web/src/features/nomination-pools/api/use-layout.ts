"use client";

import { useQuery } from "@tanstack/react-query";
import { getLayoutRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/** useLayout — раскладка этапа по пулам для клиентских компонентов админки (спека 0018, FR-18). */
export function useLayout(stageId: string) {
  return useQuery({
    queryKey: nominationPoolsKeys.layout(stageId),
    queryFn: async () => {
      const res = await getLayoutRequest(stageId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    enabled: stageId.length > 0,
  });
}
