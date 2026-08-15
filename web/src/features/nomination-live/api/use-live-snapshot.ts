"use client";

import { useQuery } from "@tanstack/react-query";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import { nominationLiveKeys } from "./keys";

/**
 * useLiveSnapshot — живой снапшот номинации обычным кэшируемым запросом
 * (спека 0032, FR-18/NFR-5): используется правым рельсом страницы этапа
 * (`widgets/stage-page/stage-rail.tsx`) как вход для чистой функции
 * `stageProgressFromSnapshot` (`entities/stage/lib/progress.ts`).
 *
 * В отличие от `useNominationLive` (SSE + polling-fallback, публичная
 * страница, `use-nomination-live.ts`) — админскому рельсу push-канал не
 * нужен: это обычный `useQuery` с кэшем и инвалидацией по ключу
 * (`nominationLiveKeys.snapshot`), которую после формирования/сброса/
 * фиксации состава делает вызывающий виджет (join-волна,
 * `stage-page-screen.tsx`), а не сам хук.
 */
export function useLiveSnapshot(nominationId: string) {
  return useQuery({
    queryKey: nominationLiveKeys.snapshot(nominationId),
    queryFn: async () => {
      const res = await fetch(`/api/nominations/${encodeURIComponent(nominationId)}/live-snapshot`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Ошибка запроса");
      }
      const data = (await res.json().catch(() => ({}))) as {
        snapshot: NominationLiveSnapshotDto | null;
      };
      return data.snapshot;
    },
    enabled: nominationId.length > 0,
  });
}
