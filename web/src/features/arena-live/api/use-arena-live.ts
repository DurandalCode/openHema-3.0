"use client";

import { useEffect, useRef, useState } from "react";
import type { BoutBoard as BoutBoardDto } from "@/entities/pool/lib/types";
import type { ArenaLiveSnapshotDto, TimerCommandDto } from "@/entities/arena-live/lib/types";

// Polling-fallback интервал (NFR-2, как 0014): используется когда SSE
// недоступен либо после серии ошибок EventSource.
const POLL_INTERVAL_MS = 3000;

// Сколько подряд `onerror` терпим прежде, чем считать канал
// невосстанавливающимся и падать на polling (как `useNominationLive`).
const SSE_ERROR_THRESHOLD = 3;

type LiveFrame =
  | { type: "snapshot"; snapshot: ArenaLiveSnapshotDto | null }
  | { type: "command"; command: TimerCommandDto | null };

async function fetchBoard(arenaId: string): Promise<BoutBoardDto | null> {
  try {
    const res = await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/board`);
    if (!res.ok) return null;
    const data = (await res.json()) as { board?: BoutBoardDto | null };
    return data.board ?? null;
  } catch {
    return null;
  }
}

/** emptySnapshotFromBoard — снапшот-заглушка на время до первого SSE-кадра. */
function emptySnapshotFromBoard(board: BoutBoardDto | null): ArenaLiveSnapshotDto | null {
  if (!board) return null;
  return {
    board,
    timer: { status: "TIMER_STATUS_STOPPED", remainingCs: 0, sampledUnixMs: "0", defaultCs: 0 },
    room: { scoreboardCount: 0, thisOrdinal: 0, thisIsSource: false, sidesSwapped: false, revealGeneration: 0 },
    defaultDurationSeconds: 90,
    serverNowUnixMs: "0",
  };
}

export type UseArenaLiveResult = {
  /** snapshot — последний известный живой снапшот табло (спека 0015). */
  snapshot: ArenaLiveSnapshotDto | null;
  /**
   * serverOffsetMs — `snapshot.serverNowUnixMs − Date.now()` в момент
   * получения последнего снапшота (опора клиентской синхронизации часов
   * для `timer-follower`, ADR 0013 §2).
   */
  serverOffsetMs: number;
  /**
   * onCommand — подписка на ретранслированные команды панели (спека 0015,
   * FR-7): единственный владелец EventSource — `useArenaLive`; `use-arena-timer`
   * подписывается через этот колбэк вместо открытия второго подключения.
   * Возвращает функцию отписки.
   */
  onCommand: (listener: (command: TimerCommandDto) => void) => () => void;
};

/**
 * useArenaLive — живой снапшот табло арены на клиенте (спека 0015, FR-3/
 * FR-18): открывает SSE-канал `/api/arenas/{id}/live?role=...` (admin-only),
 * по образцу `useNominationLive` (0014). Разбирает оба типа кадра
 * (`snapshot`/`command`, `WatchArenaBoardResponse.event` oneof) — `snapshot`
 * обновляет состояние целиком, `command` ретранслируется подписчикам через
 * `onCommand` (потребитель — `useArenaTimer`, роль-источник).
 */
export function useArenaLive(
  arenaId: string,
  role: "scoreboard" | "panel",
  initialBoard: BoutBoardDto | null,
): UseArenaLiveResult {
  const [snapshot, setSnapshot] = useState<ArenaLiveSnapshotDto | null>(() =>
    emptySnapshotFromBoard(initialBoard),
  );
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const listenersRef = useRef<Set<(command: TimerCommandDto) => void>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    const startPolling = () => {
      if (pollInterval || cancelled) return;
      pollInterval = setInterval(async () => {
        const board = await fetchBoard(arenaId);
        if (!cancelled && board) {
          setSnapshot((prev) => (prev ? { ...prev, board } : emptySnapshotFromBoard(board)));
        }
      }, POLL_INTERVAL_MS);
    };

    if (typeof EventSource === "undefined") {
      startPolling();
      return () => {
        cancelled = true;
        if (pollInterval) clearInterval(pollInterval);
      };
    }

    let errorCount = 0;
    es = new EventSource(`/api/arenas/${encodeURIComponent(arenaId)}/live?role=${role}`);

    const fallbackToPolling = () => {
      es?.close();
      es = null;
      startPolling();
    };

    es.onmessage = (ev: MessageEvent<string>) => {
      errorCount = 0;
      try {
        const frame = JSON.parse(ev.data) as LiveFrame;
        if (cancelled) return;
        if (frame.type === "snapshot" && frame.snapshot) {
          setSnapshot(frame.snapshot);
          setServerOffsetMs(Number(frame.snapshot.serverNowUnixMs) - Date.now());
        } else if (frame.type === "command" && frame.command) {
          const command = frame.command;
          listenersRef.current.forEach((listener) => listener(command));
        }
      } catch {
        // кадр повреждён — игнорируем, ждём следующий.
      }
    };

    es.onerror = () => {
      errorCount += 1;
      if (errorCount >= SSE_ERROR_THRESHOLD) {
        fallbackToPolling();
      }
    };

    return () => {
      cancelled = true;
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [arenaId, role]);

  function onCommand(listener: (command: TimerCommandDto) => void): () => void {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }

  return { snapshot, serverOffsetMs, onCommand };
}
