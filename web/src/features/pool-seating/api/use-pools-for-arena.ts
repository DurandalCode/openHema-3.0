"use client";

import { useQuery } from "@tanstack/react-query";
import { getPoolsForArenaRequest, type ArenaPoolsState } from "./requests";
import { poolSeatingKeys } from "./keys";

/**
 * usePoolsForArena — пул, стоящий сейчас на арене (или `null`), готовые к
 * постановке пулы (спека 0011, FR-9) и очередь арены по порядку (спека 0063).
 * Питает секцию постановки на странице арены.
 */
export function usePoolsForArena(arenaId: string) {
  return useQuery<ArenaPoolsState>({
    queryKey: poolSeatingKeys.forArena(arenaId),
    queryFn: async () => {
      const res = await getPoolsForArenaRequest(arenaId);
      if (!res.ok) throw new Error(res.error);
      return { seated: res.seated, available: res.available, queued: res.queued };
    },
    enabled: arenaId.length > 0,
  });
}
