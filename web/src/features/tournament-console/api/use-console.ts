"use client";

import { useEffect, useState } from "react";
import type { TournamentConsoleSnapshotDto } from "@/entities/tournament-console/lib/types";

// Polling-fallback интервал (спека 0043, FR-18) — тот же приём и то же
// значение, что `useTournamentLive` (0034)/`useNominationLive` (0014).
const POLL_INTERVAL_MS = 3000;

// Сколько подряд `onerror` от EventSource терпим, прежде чем считать канал
// не восстанавливающимся и падать на polling.
const SSE_ERROR_THRESHOLD = 3;

async function fetchSnapshot(tournamentId: string): Promise<TournamentConsoleSnapshotDto | null> {
  try {
    const res = await fetch(`/api/tournaments/${tournamentId}/console`);
    if (!res.ok) return null;
    const data = (await res.json()) as { snapshot: TournamentConsoleSnapshotDto | null };
    return data.snapshot;
  } catch {
    return null;
  }
}

/**
 * useConsole — живой пульт турнира на клиенте (спека 0043, FR-18):
 * дословный порт `useTournamentLive` (0034) на пульт — тот же приём
 * (SSE + polling-fallback), другой источник данных (admin-only, требует
 * `tournamentId` в пути обоих BFF-маршрутов — в отличие от
 * `useTournamentLive`, которому оба маршрута сами резолвят активный
 * турнир). Открывает SSE-канал `/api/tournaments/[id]/console/stream`,
 * применяет каждый кадр к состоянию; после `SSE_ERROR_THRESHOLD` ошибок
 * подряд без успешного кадра — переход на periodic polling
 * `/api/tournaments/[id]/console` (тот же маршрут, что отдаёт первый
 * снапшот на SSR). Если `EventSource` недоступен вовсе — сразу на polling.
 *
 * Локальный стрим-стейт (`useState`/`useEffect`) — не TanStack Query (ADR
 * 0006 явно допускает этот случай для push-каналов).
 */
export function useConsole(
  tournamentId: string,
  initialSnapshot: TournamentConsoleSnapshotDto,
): TournamentConsoleSnapshotDto {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    const startPolling = () => {
      if (pollInterval || cancelled) return;
      pollInterval = setInterval(async () => {
        const next = await fetchSnapshot(tournamentId);
        if (next && !cancelled) setSnapshot(next);
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
    es = new EventSource(`/api/tournaments/${tournamentId}/console/stream`);

    const fallbackToPolling = () => {
      es?.close();
      es = null;
      startPolling();
    };

    es.onmessage = (ev: MessageEvent<string>) => {
      errorCount = 0;
      try {
        const next = JSON.parse(ev.data) as TournamentConsoleSnapshotDto;
        if (!cancelled) setSnapshot(next);
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
    // tournamentId не меняется в рамках жизни экрана пульта (переход на
    // другой турнир — переход на другой роут, не смена пропа).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return snapshot;
}
