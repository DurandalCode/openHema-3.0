"use client";

import { useQueries } from "@tanstack/react-query";
import { arenaLiveStatus, type ArenaLiveStatus } from "@/entities/arena-live/lib/status";
import type { Arena } from "@/entities/arena/lib/types";
import { getArenaBoardRequest } from "./requests";
import { arenaManagementKeys } from "./keys";

const REFETCH_INTERVAL_MS = 10_000;

export type ArenaBoardState = { status: ArenaLiveStatus; isError: boolean };

/**
 * useArenaBoards — живой статус доски по каждой **активной** площадке
 * (спека 0027, FR-3/FR-5/FR-8): опрос `GET /api/arenas/[id]/board` по
 * одной на площадку, с периодическим обновлением. Архивные площадки не
 * запрашиваются вовсе (FR-5) — вызывающий код сам решает их статус
 * (`"archived"`, не производится `arenaLiveStatus`).
 *
 * Сознательно НЕ подписка на живой канал табло (`WatchArenaBoard`, 0015):
 * список настроек не должен входить в комнату площадки и влиять на
 * нумерацию табло/выбор авторитета таймера (FR-9). Поэтому — polling с
 * коротким интервалом, а не SSE.
 *
 * Ошибка запроса одной площадки не роняет остальные (FR-10): `retry:
 * false`, отказавшая площадка возвращает `isError: true` с безопасным
 * дефолтом `"free"`-статуса как заглушкой (UI показывает «статус
 * недоступен» по `isError`, не по содержимому `status`).
 */
export function useArenaBoards(activeArenas: Arena[]): Map<string, ArenaBoardState> {
  const results = useQueries({
    queries: activeArenas.map((arena) => ({
      queryKey: arenaManagementKeys.board(arena.id),
      queryFn: async () => {
        const res = await getArenaBoardRequest(arena.id);
        if (!res.ok) throw new Error(res.error);
        return res.board;
      },
      refetchInterval: REFETCH_INTERVAL_MS,
      refetchIntervalInBackground: false,
      retry: false,
    })),
  });

  const map = new Map<string, ArenaBoardState>();
  activeArenas.forEach((arena, i) => {
    const result = results[i];
    map.set(arena.id, {
      status: arenaLiveStatus(result.data ?? null),
      isError: result.isError,
    });
  });
  return map;
}
