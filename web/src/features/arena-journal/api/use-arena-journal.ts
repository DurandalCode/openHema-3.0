"use client";

import { useQuery } from "@tanstack/react-query";
import { getArenaJournalRequest } from "./requests";
import { arenaJournalKeys } from "./keys";

/**
 * useArenaJournal — журнал боёв пула, стоящего на арене (спека 0033,
 * FR-33/FR-35): новыми записями вперёд. Пустой массив, если на арене никто
 * не стоит. Питает `ui/arena-journal.tsx` в режиме управления.
 */
export function useArenaJournal(arenaId: string) {
  return useQuery({
    queryKey: arenaJournalKeys.journal(arenaId),
    queryFn: async () => {
      const res = await getArenaJournalRequest(arenaId);
      if (!res.ok) throw new Error(res.error);
      return res.entries;
    },
    enabled: arenaId.length > 0,
  });
}
