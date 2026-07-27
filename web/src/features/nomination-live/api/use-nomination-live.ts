"use client";

import { useEffect, useState } from "react";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";

// Polling-fallback интервал (NFR-2): используется когда SSE недоступен
// (typeof EventSource === "undefined") либо после серии ошибок ES.
const POLL_INTERVAL_MS = 3000;

// Сколько подряд `onerror` от EventSource терпим, прежде чем считать канал
// не восстанавливающимся и падать на polling. Нативный EventSource уже
// авто-переподключается (FR-8) — единичный `onerror` не повод сдаваться;
// серия ошибок подряд (без промежуточного успешного `onmessage`) — повод.
const SSE_ERROR_THRESHOLD = 3;

async function fetchSnapshot(nominationId: string): Promise<NominationLiveSnapshotDto | null> {
  try {
    const res = await fetch(`/api/nominations/${nominationId}/live-snapshot`);
    if (!res.ok) return null;
    const data = (await res.json()) as { snapshot: NominationLiveSnapshotDto | null };
    return data.snapshot;
  } catch {
    return null;
  }
}

/**
 * useNominationLive — живой снапшот номинации на клиенте (спека 0014, FR-6..
 * FR-9): открывает SSE-канал `/api/nominations/{id}/live`, применяет каждый
 * кадр к состоянию. Нативный `EventSource` авто-переподключается сам
 * (FR-8) — единичный обрыв не повод паниковать; после `SSE_ERROR_THRESHOLD`
 * ошибок подряд (без успешного кадра между ними) считаем канал
 * невосстановимым и переходим на periodic polling `/live-snapshot`
 * (fallback, NFR-2). Если `EventSource` недоступен в окружении вовсе
 * (старый браузер) — сразу на polling.
 *
 * Локальный стрим-стейт (`useState`/`useEffect`) — не TanStack Query (RQ не
 * покрывает push-канал, ADR 0006 явно допускает этот случай).
 */
export function useNominationLive(
  nominationId: string,
  initialSnapshot: NominationLiveSnapshotDto,
): NominationLiveSnapshotDto {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    const startPolling = () => {
      if (pollInterval || cancelled) return;
      pollInterval = setInterval(async () => {
        const next = await fetchSnapshot(nominationId);
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
    es = new EventSource(`/api/nominations/${nominationId}/live`);

    const fallbackToPolling = () => {
      es?.close();
      es = null;
      startPolling();
    };

    es.onmessage = (ev: MessageEvent<string>) => {
      errorCount = 0;
      try {
        const next = JSON.parse(ev.data) as NominationLiveSnapshotDto;
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
  }, [nominationId]);

  return snapshot;
}
