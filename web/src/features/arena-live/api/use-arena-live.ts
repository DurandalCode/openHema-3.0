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

/**
 * emptySnapshotFromBoard — снапшот-заглушка на время до первого SSE-кадра.
 * `defaultDurationSeconds` приходит от страницы (она и так грузит арену
 * серверным рендером): иначе таймер до первого кадра показывал бы хардкод
 * 90с, расходясь с подписью «Длительность: Nс» — половина полевого бага
 * «1:30 при 60с».
 */
function emptySnapshotFromBoard(
  board: BoutBoardDto | null,
  defaultDurationSeconds: number,
): ArenaLiveSnapshotDto | null {
  if (!board) return null;
  const defaultCs = defaultDurationSeconds * 100;
  return {
    board,
    timer: { status: "TIMER_STATUS_STOPPED", remainingCs: defaultCs, sampledUnixMs: "0", defaultCs },
    room: { scoreboardCount: 0, thisOrdinal: 0, thisIsSource: false, sidesSwapped: false, revealGeneration: 0 },
    defaultDurationSeconds,
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
  /**
   * connection — видимое состояние живого канала (спека 0033, FR-23):
   * `"lost"` с момента, когда канал молча падал на polling (тот же порог
   * `SSE_ERROR_THRESHOLD`), `"live"` — оптимистичный дефолт до первого
   * кадра и состояние после восстановления.
   */
  connection: "live" | "lost";
  /**
   * lostSinceMs — `Date.now()` момента перехода в `"lost"`; `null`, пока
   * `connection === "live"`. Основа для `connectionLabel` (entities/
   * arena-live/lib/connection.ts, T8) — сама длительность здесь не считается.
   */
  lostSinceMs: number | null;
  /**
   * reconnect — принудительно закрывает текущее соединение (EventSource
   * либо polling-интервал) и заново запускает цикл открытия EventSource
   * (FR-24, кнопка «Переподключиться»). Не переключает автоматически с
   * polling обратно на EventSource сама по себе — это делает только явный
   * вызов.
   */
  reconnect: () => void;
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
  defaultDurationSeconds = 90,
): UseArenaLiveResult {
  const [snapshot, setSnapshot] = useState<ArenaLiveSnapshotDto | null>(() =>
    emptySnapshotFromBoard(initialBoard, defaultDurationSeconds),
  );
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [connection, setConnection] = useState<"live" | "lost">("live");
  const [lostSinceMs, setLostSinceMs] = useState<number | null>(null);
  const listenersRef = useRef<Set<(command: TimerCommandDto) => void>>(new Set());
  const reconnectRef = useRef<() => void>(() => {});
  // В ref, а не в зависимостях SSE-эффекта: дефолт площадки может смениться
  // на лету, и попади он в deps — живой стрим пересоздавался бы на каждую
  // такую правку. Нужен он только в редкой ветке polling-фоллбэка, когда
  // снапшота ещё нет вовсе.
  const defaultDurationRef = useRef(defaultDurationSeconds);
  defaultDurationRef.current = defaultDurationSeconds;

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;
    let errorCount = 0;

    const markLive = () => {
      errorCount = 0;
      setConnection("live");
      setLostSinceMs(null);
    };

    const markLost = () => {
      setConnection("lost");
      setLostSinceMs(Date.now());
    };

    const closeAll = () => {
      es?.close();
      es = null;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const startPolling = () => {
      if (pollInterval || cancelled) return;
      pollInterval = setInterval(async () => {
        const board = await fetchBoard(arenaId);
        if (!cancelled && board) {
          setSnapshot((prev) =>
            prev ? { ...prev, board } : emptySnapshotFromBoard(board, defaultDurationRef.current),
          );
          markLive();
        }
      }, POLL_INTERVAL_MS);
    };

    const fallbackToPolling = () => {
      es?.close();
      es = null;
      markLost();
      startPolling();
    };

    /**
     * connect — (пере)открывает живой канал: тот же цикл, что и при
     * монтировании. Общая точка входа и для первого запуска, и для
     * `reconnect()` (FR-24) — счётчик ошибок и текущее соединение
     * сбрасываются, EventSource пробуется заново, даже если до этого канал
     * был на polling-fallback.
     */
    const connect = () => {
      closeAll();
      errorCount = 0;

      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }

      es = new EventSource(`/api/arenas/${encodeURIComponent(arenaId)}/live?role=${role}`);

      es.onmessage = (ev: MessageEvent<string>) => {
        markLive();
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
    };

    connect();
    reconnectRef.current = connect;

    return () => {
      cancelled = true;
      closeAll();
    };
  }, [arenaId, role]);

  function onCommand(listener: (command: TimerCommandDto) => void): () => void {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }

  function reconnect(): void {
    reconnectRef.current();
  }

  return { snapshot, serverOffsetMs, onCommand, connection, lostSinceMs, reconnect };
}
