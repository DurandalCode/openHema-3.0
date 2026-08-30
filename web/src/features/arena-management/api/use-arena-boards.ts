"use client";

import { useQuery } from "@tanstack/react-query";
import { arenaLiveStatus, type ArenaLiveStatus } from "@/entities/arena-live/lib/status";
import type { Arena } from "@/entities/arena/lib/types";
import { getArenaBoardsRequest, type ArenaBoardEntry } from "./requests";
import { arenaManagementKeys } from "./keys";

const REFETCH_INTERVAL_MS = 10_000;

const UNKNOWN_STATUS: ArenaLiveStatus = { kind: "unknown", title: "—", detail: null, pulse: false };

export type ArenaBoardState = { status: ArenaLiveStatus; isError: boolean };

/**
 * useArenaBoards — живой статус доски по каждой **активной** площадке
 * турнира (спека 0027, FR-3/FR-5/FR-8; спека 0041, FR-7/FR-9): опрос
 * `GET /api/tournaments/[id]/arena-boards` ОДНИМ агрегирующим запросом на
 * весь турнир за цикл обновления вместо N параллельных запросов по одному
 * на площадку (0041 заменяет прежний `useQueries` над
 * `GET /api/arenas/[id]/board`). Частота обновления не меняется (0041,
 * FR-9) — меняется только число обращений за цикл. Архивные площадки не
 * запрашиваются вовсе (0027, FR-5) — вызывающий код сам решает их статус
 * (`"archived"`, не производится `arenaLiveStatus`).
 *
 * Сознательно НЕ подписка на живой канал табло (`WatchArenaBoard`, 0015):
 * список настроек не должен входить в комнату площадки и влиять на
 * нумерацию табло/выбор авторитета таймера (FR-9, 0027). Поэтому — polling
 * с коротким интервалом, а не SSE.
 *
 * Отличие от прежней поэлементной семантики ошибок (0027, FR-10: ошибка
 * одной площадки не роняет остальные): агрегирующий RPC — один HTTP-запрос
 * на весь турнир, поэтому `isError` теперь ОБЩИЙ на все площадки сразу
 * (запрос либо целиком успевает, либо целиком падает), а не независимый по
 * каждой площадке, как было при N отдельных `useQueries`. То же решение
 * принято на серверной стороне того же RPC — см. комментарий
 * `server/modules/stage/service/stage_aggregates.go` над `GetArenaBoards`:
 * там единственный реалистичный источник ошибки на чтении доски одной
 * площадки — тот же отказ хранилища/порта, что уронил бы и чтение
 * остальных площадок этого же запроса, поэтому ошибка одной записи
 * возвращается как ошибка всего запроса, не отдельной записи.
 */
export function useArenaBoards(
  tournamentId: string,
  activeArenas: Arena[],
): Map<string, ArenaBoardState> {
  const result = useQuery({
    queryKey: arenaManagementKeys.boards(tournamentId),
    queryFn: async () => {
      const res = await getArenaBoardsRequest(tournamentId);
      if (!res.ok) throw new Error(res.error);
      return res.entries;
    },
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const entriesByArenaId = new Map<string, ArenaBoardEntry>();
  (result.data ?? []).forEach((entry) => entriesByArenaId.set(entry.arenaId, entry));

  const map = new Map<string, ArenaBoardState>();
  activeArenas.forEach((arena) => {
    const entry = entriesByArenaId.get(arena.id);
    map.set(arena.id, {
      // Пока не пришёл ни один ответ, либо площадка отсутствует в ответе
      // (например, гонка обновления списка площадок и цикла опроса) — «—»,
      // а не преждевременное «Свободна» (не врём результатом до
      // разрешения запроса/появления записи).
      status:
        entry === undefined
          ? UNKNOWN_STATUS
          : arenaLiveStatus(entry.board, { idleState: entry.idleState, freeSince: entry.freeSince }),
      isError: result.isError,
    });
  });
  return map;
}
