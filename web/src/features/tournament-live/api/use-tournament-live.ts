"use client";

import { useEffect, useState } from "react";
import type { TournamentLiveSnapshotDto } from "@/entities/tournament-live/lib/types";

// Polling-fallback интервал (AC-17): используется когда SSE недоступен
// (typeof EventSource === "undefined") либо после серии ошибок ES. Тот же
// интервал, что `useNominationLive` (спека 0014).
const POLL_INTERVAL_MS = 3000;

// Сколько подряд `onerror` от EventSource терпим, прежде чем считать канал
// не восстанавливающимся и падать на polling — см. `useNominationLive`.
const SSE_ERROR_THRESHOLD = 3;

async function fetchSnapshot(): Promise<TournamentLiveSnapshotDto | null> {
  try {
    const res = await fetch("/api/tournament/live-snapshot");
    if (!res.ok) return null;
    const data = (await res.json()) as { snapshot: TournamentLiveSnapshotDto | null };
    return data.snapshot;
  } catch {
    return null;
  }
}

/**
 * useTournamentLive — живая сводка турнира целиком на клиенте (спека 0034,
 * FR-19): дословный порт `useNominationLive` (спека 0014) на уровень выше —
 * весь турнир, не одна номинация. Открывает SSE-канал `/api/tournament/live`,
 * применяет каждый кадр к состоянию; после `SSE_ERROR_THRESHOLD` ошибок
 * подряд без успешного кадра — переход на periodic polling
 * `/api/tournament/live-snapshot` (fallback, AC-17). Если `EventSource`
 * недоступен вовсе — сразу на polling.
 *
 * Два отличия от `useNominationLive`:
 * 1. Нет параметра `nominationId` — у турнира нет id в маршруте BFF, оба
 *    роута сами резолвят активный турнир (см. `plan.md`, «Контракты»).
 * 2. `enabled` — решает вызывающий компонент, открывать ли подписку вовсе
 *    (FR-23: в фазах `before`/`finished` живой канал не нужен, снапшот и
 *    так статичен). `enabled` читается **только** при монтировании эффекта
 *    (см. зависимости `useEffect`) — динамическое переключение в рантайме
 *    не поддерживается: единственная точка, где решается фаза турнира, это
 *    сам компонент-обёртка, и он размонтирует/монтирует хук заново вместе
 *    со сменой раскладки экрана, а не дёргает один и тот же хук туда-обратно.
 *    Если `enabled === false`, хук не создаёт ни `EventSource`, ни
 *    `interval` — возвращает `initialSnapshot` как есть.
 *
 * Локальный стрим-стейт (`useState`/`useEffect`) — не TanStack Query (ADR
 * 0006 явно допускает этот случай для push-каналов).
 */
export function useTournamentLive(
  initialSnapshot: TournamentLiveSnapshotDto,
  enabled: boolean,
): TournamentLiveSnapshotDto {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    const startPolling = () => {
      if (pollInterval || cancelled) return;
      pollInterval = setInterval(async () => {
        const next = await fetchSnapshot();
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
    es = new EventSource("/api/tournament/live");

    const fallbackToPolling = () => {
      es?.close();
      es = null;
      startPolling();
    };

    es.onmessage = (ev: MessageEvent<string>) => {
      errorCount = 0;
      try {
        const next = JSON.parse(ev.data) as TournamentLiveSnapshotDto;
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
    // enabled решается один раз при монтировании (см. doc-комментарий выше).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return snapshot;
}
