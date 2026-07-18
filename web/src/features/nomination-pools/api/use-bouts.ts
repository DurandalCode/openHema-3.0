"use client";

import { useQuery } from "@tanstack/react-query";
import type { PoolLayoutStatus } from "@/entities/pool/lib/types";
import { fetchBouts } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useBouts — бои всех пулов номинации (спека 0010). Бои существуют только
 * после фиксации раскладки (`draft → ready`, AC-5) — запрос включён только
 * когда `layoutStatus === "POOL_LAYOUT_STATUS_READY"`, иначе (draft/loading)
 * не бьёт по BFF впустую и не показывает устаревшие бои после возврата в
 * draft.
 */
export function useBouts(nominationId: string, layoutStatus: PoolLayoutStatus | undefined) {
  return useQuery({
    queryKey: nominationPoolsKeys.bouts(nominationId),
    queryFn: async () => {
      const res = await fetchBouts(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.bouts;
    },
    enabled: nominationId.length > 0 && layoutStatus === "POOL_LAYOUT_STATUS_READY",
  });
}
