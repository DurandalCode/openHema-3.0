"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apply,
  frameOf,
  onCurrentBoutChanged,
  type TimerCommand as AuthorityCommand,
  type TimerState,
  type TimerStatus,
} from "@/features/arena-timer/model/timer-authority";
import { applyFrame, smoothDisplay } from "@/features/arena-timer/model/timer-follower";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import type { TimerCommandDto, TimerStatusDto } from "@/entities/arena-live/lib/types";

// Публикация полного кадра таймера источником (спека 0015, ADR 0013 §2):
// ~200мс пока RUNNING + немедленно на каждом переходе статуса.
const PUBLISH_INTERVAL_MS = 200;
// Троттлинг обновлений отображаемого состояния (`useState`) — держим
// TimerState в useRef (не useState), чтобы не перерендеривать на каждый
// rAF-тик без необходимости; для отображения — до ~10 раз/сек.
const DISPLAY_THROTTLE_MS = 100;

const STATUS_TO_DTO: Record<TimerStatus, TimerStatusDto> = {
  STOPPED: "TIMER_STATUS_STOPPED",
  RUNNING: "TIMER_STATUS_RUNNING",
  PAUSED: "TIMER_STATUS_PAUSED",
  EXPIRED: "TIMER_STATUS_EXPIRED",
};

const STATUS_FROM_DTO: Record<TimerStatusDto, TimerStatus> = {
  TIMER_STATUS_UNSPECIFIED: "STOPPED",
  TIMER_STATUS_STOPPED: "STOPPED",
  TIMER_STATUS_RUNNING: "RUNNING",
  TIMER_STATUS_PAUSED: "PAUSED",
  TIMER_STATUS_EXPIRED: "EXPIRED",
};

function commandDtoToAuthority(command: TimerCommandDto): AuthorityCommand | null {
  switch (command.kind) {
    case "TIMER_COMMAND_KIND_START":
      return { kind: "START" };
    case "TIMER_COMMAND_KIND_PAUSE":
      return { kind: "PAUSE" };
    case "TIMER_COMMAND_KIND_RESET":
      return { kind: "RESET" };
    case "TIMER_COMMAND_KIND_ADJUST":
      return { kind: "ADJUST", amountSeconds: command.amountSeconds };
    default:
      return null;
  }
}

async function postTimerFrame(arenaId: string, state: TimerState): Promise<void> {
  try {
    await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/timer-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: STATUS_TO_DTO[state.status],
        remainingCs: state.remainingCs,
        sampledUnixMs: state.referenceMs,
        defaultCs: state.defaultCs,
      }),
    });
  } catch {
    // Сеть недоступна — следующий тик/переход попробует снова; таймер
    // недоменный (FR-16), потерянный кадр не критичен.
  }
}

async function postTimerCommand(
  arenaId: string,
  kind: "START" | "PAUSE" | "RESET" | "ADJUST",
  amountSeconds?: number,
): Promise<void> {
  try {
    await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, amountSeconds }),
    });
  } catch {
    // Панель доступна независимо от роли табло — ошибка сети всплывёт при
    // следующей попытке; не блокируем UI.
  }
}

export type TimerDisplay = { status: TimerStatus; remainingCs: number };

export type UseArenaTimerResult = {
  display: TimerDisplay;
  controls: {
    start: () => void;
    pause: () => void;
    reset: () => void;
    adjust: (amountSeconds: number) => void;
  };
};

/**
 * useArenaTimer — недоменный таймер боя (спека 0015, ADR 0013): на
 * авторитетном табло (`live.snapshot.room.thisIsSource`) гоняет
 * `timer-authority` по `requestAnimationFrame`, применяет входящие
 * `command`-кадры (`live.onCommand`) и публикует полные кадры
 * (`POST /timer-frame`) ~раз в 200мс, пока `RUNNING`, и на каждом переходе
 * статуса. На НЕ-источнике использует `timer-follower` (`applyFrame` +
 * `frameOf` + `smoothDisplay`) на входящих `snapshot`-кадрах.
 *
 * `controls.*` (старт/пауза/сброс/±секунды) шлют `POST /timer` (спека 0015,
 * FR-7) всегда, независимо от роли — это команды панели, ретранслируемые
 * сервером источнику (ADR 0013).
 */
export function useArenaTimer(arenaId: string, live: UseArenaLiveResult): UseArenaTimerResult {
  const snapshot = live.snapshot;
  const isSource = snapshot?.room.thisIsSource ?? false;
  const defaultCs = (snapshot?.defaultDurationSeconds ?? 90) * 100;

  const [display, setDisplay] = useState<TimerDisplay>({ status: "STOPPED", remainingCs: defaultCs });

  const stateRef = useRef<TimerState>({
    status: "STOPPED",
    remainingCs: defaultCs,
    referenceMs: Date.now(),
    defaultCs,
  });
  const lastPublishRef = useRef(0);
  const lastDisplayUpdateRef = useRef(0);
  const currentBoutIdRef = useRef<string | null>(null);
  const followerDisplayedCsRef = useRef<number | null>(null);

  const publishNow = useCallback(() => {
    lastPublishRef.current = Date.now();
    void postTimerFrame(arenaId, stateRef.current);
  }, [arenaId]);

  // Дефолт арены (персистентный, FR-8) может смениться (панель правит его
  // на лету) — источник использует актуальный при RESET/init (plan.md).
  useEffect(() => {
    stateRef.current = { ...stateRef.current, defaultCs };
  }, [defaultCs]);

  // Авто-сброс при смене текущего боя (FR-15/AC-11) — только источник:
  // домен таймер не двигает, это клиентский UX-эффект (табло-источник).
  useEffect(() => {
    const newCurrentId = snapshot?.board?.currentBoutId ?? null;
    if (isSource && currentBoutIdRef.current !== null && newCurrentId !== currentBoutIdRef.current) {
      stateRef.current = onCurrentBoutChanged(stateRef.current, Date.now());
      publishNow();
    }
    currentBoutIdRef.current = newCurrentId;
  }, [isSource, snapshot?.board?.currentBoutId, publishNow]);

  // Применение входящих команд панели (только источник применяет — FR-11).
  useEffect(() => {
    if (!isSource) return undefined;
    return live.onCommand((command) => {
      const authorityCommand = commandDtoToAuthority(command);
      if (!authorityCommand) return;
      stateRef.current = apply(stateRef.current, authorityCommand, Date.now());
      publishNow();
    });
  }, [isSource, live, publishNow]);

  // rAF-цикл: источник — крутит authority локально; follower — довод между
  // кадрами через `timer-follower`. Оба троттлят `setDisplay` до ~10/сек.
  useEffect(() => {
    let rafId: number;

    function tick() {
      const now = Date.now();

      if (isSource) {
        const f = frameOf(stateRef.current, now);
        if (f.status !== stateRef.current.status) {
          // Переход (обычно RUNNING → EXPIRED, FR-9) — зафиксировать в
          // stateRef и опубликовать немедленно (спека: «на каждом переходе»).
          stateRef.current = { ...stateRef.current, status: f.status, remainingCs: f.remainingCs };
          publishNow();
        }
        if (now - lastDisplayUpdateRef.current >= DISPLAY_THROTTLE_MS) {
          lastDisplayUpdateRef.current = now;
          setDisplay({ status: f.status, remainingCs: f.remainingCs });
        }
        if (stateRef.current.status === "RUNNING" && now - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
          publishNow();
        }
      } else if (snapshot?.timer) {
        const followerState = applyFrame(
          {
            status: STATUS_FROM_DTO[snapshot.timer.status],
            remainingCs: snapshot.timer.remainingCs,
            sampledUnixMs: Number(snapshot.timer.sampledUnixMs),
            defaultCs: snapshot.timer.defaultCs,
          },
          live.serverOffsetMs,
          now,
        );
        const f = frameOf(followerState, now);
        const previousDisplayed = followerDisplayedCsRef.current ?? f.remainingCs;
        const dtMs = lastDisplayUpdateRef.current === 0 ? 0 : now - lastDisplayUpdateRef.current;
        const smoothed = smoothDisplay(previousDisplayed, f.remainingCs, dtMs, followerState.defaultCs);
        followerDisplayedCsRef.current = smoothed;

        if (now - lastDisplayUpdateRef.current >= DISPLAY_THROTTLE_MS) {
          lastDisplayUpdateRef.current = now;
          setDisplay({ status: f.status, remainingCs: Math.round(smoothed) });
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isSource, snapshot?.timer, live.serverOffsetMs, publishNow]);

  const start = useCallback(() => void postTimerCommand(arenaId, "START"), [arenaId]);
  const pause = useCallback(() => void postTimerCommand(arenaId, "PAUSE"), [arenaId]);
  const reset = useCallback(() => void postTimerCommand(arenaId, "RESET"), [arenaId]);
  const adjust = useCallback(
    (amountSeconds: number) => void postTimerCommand(arenaId, "ADJUST", amountSeconds),
    [arenaId],
  );

  return { display, controls: { start, pause, reset, adjust } };
}
