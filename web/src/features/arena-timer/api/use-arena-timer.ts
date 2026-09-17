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
import { apiFetch } from "@/shared/api/api-fetch";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { useSessionExpiredStore } from "@/shared/lib/session-expired-store";
import { recoverSessionOrNotify } from "@/shared/lib/silent-refresh";

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

/**
 * handleFireAndForgetUnauthorized — таймер и панель шлют команды без ожидания
 * ответа (следующий тик/переход просто повторит попытку, FR-16) — но 401 не
 * должно тонуть в этом молчании (спека 0039, FR-17/NFR-5). `apiFetch` бросает
 * `UnauthorizedError` вне сетевого `try`, и здесь она ловится явно: эти вызовы
 * не идут через TanStack Query, значит и не через `QueryCache`/
 * `MutationCache.onError` из `shared/lib/query-client.ts`.
 *
 * Раньше 401 открывал диалог «Сессия истекла» НЕМЕДЛЕННО, минуя тихое
 * продление, которое есть у всех обычных запросов. На консоли арены это и
 * был самый громкий источник полевой жалобы «постоянно сбрасывается сессия»:
 * кадр таймера уходит каждые ~200мс, и первый же после истечения access-куки
 * выбрасывал секретаря посреди боя. Теперь сперва `recoverSessionOrNotify`
 * (он же сам поднимет диалог, если продлить не вышло, и не даст забомбить
 * `/api/auth/refresh` на частоте кадров — см. его cooldown).
 *
 * Возвращает `true`, если сессия восстановлена и вызов имеет смысл повторить.
 */
async function handleFireAndForgetUnauthorized(err: unknown): Promise<boolean> {
  if (!(err instanceof UnauthorizedError)) return false;
  // Иначе — сеть недоступна; следующий тик/переход попробует снова.
  return recoverSessionOrNotify();
}

async function postTimerFrame(arenaId: string, state: TimerState): Promise<void> {
  try {
    await apiFetch(`/api/arenas/${encodeURIComponent(arenaId)}/timer-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: STATUS_TO_DTO[state.status],
        remainingCs: state.remainingCs,
        sampledUnixMs: state.referenceMs,
        defaultCs: state.defaultCs,
      }),
    });
  } catch (err) {
    // Ретрая намеренно нет: следующий кадр через ~200мс несёт ПОЛНОЕ
    // состояние, так что потерянный кадр невидим (FR-16).
    void handleFireAndForgetUnauthorized(err);
  }
}

async function postTimerCommand(
  arenaId: string,
  kind: "START" | "PAUSE" | "RESET" | "ADJUST",
  amountSeconds?: number,
): Promise<void> {
  const url = `/api/arenas/${encodeURIComponent(arenaId)}/timer`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, amountSeconds }),
  };

  try {
    await apiFetch(url, init);
  } catch (err) {
    // В отличие от кадра, команду ретраим: потерянный START/PAUSE — это
    // судья, нажавший кнопку, и ничего не произошло.
    //
    // Ретрай безопасен даже для неидемпотентного ADJUST, потому что
    // выполняется ТОЛЬКО после подтверждённого 401, а 401 каждый BFF-роут
    // возвращает веткой `if (!accessToken)` ДО любого gRPC-вызова — значит
    // первая попытка доказуемо не дошла до домена и задвоить нечего.
    // Не «упрощать» это условие.
    if (!(await handleFireAndForgetUnauthorized(err))) return;
    try {
      await apiFetch(url, init);
    } catch (retryErr) {
      if (retryErr instanceof UnauthorizedError) {
        useSessionExpiredStore.getState().open("query");
      }
    }
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
 * useArenaTimer — недоменный таймер боя (спека 0015, ADR 0013): у текущего
 * источника комнаты (`live.snapshot.room.thisIsSource` — это табло №1, а
 * если табло не открыто ни одного, то панель-фоллбэк) гоняет
 * `timer-authority` по `requestAnimationFrame`, применяет входящие
 * `command`-кадры (`live.onCommand`) и публикует полные кадры
 * (`POST /timer-frame`) ~раз в 200мс, пока `RUNNING`, и на каждом переходе
 * статуса. На НЕ-источнике использует `timer-follower` (`applyFrame` +
 * `frameOf` + `smoothDisplay`) на входящих `snapshot`-кадрах. Роли как
 * таковой хук не знает — только флаг, поэтому панель ведёт таймер тем же
 * кодом, что и табло.
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
  // null — роль ещё не наблюдалась (кадра комнаты не было); дальше true/false.
  const wasSourceRef = useRef<boolean | null>(null);

  const publishNow = useCallback(() => {
    lastPublishRef.current = Date.now();
    void postTimerFrame(arenaId, stateRef.current);
  }, [arenaId]);

  // Становление источником (ADR 0013 §4 «хэндофф»): к моменту повышения мы
  // были ведомыми и НЕ вели stateRef — он так и остался от монтирования.
  // Поэтому засеваем его последним кадром комнаты: сервер держит кадр, пока
  // комната жива, и именно он — то время, на котором остановился прошлый
  // источник. Без этого идущий отсчёт обнулялся бы до дефолта ровно в
  // момент, когда оператор закрыл вкладку табло.
  //
  // Публикуем только при НАСТОЯЩЕМ перехвате (были ведомыми — стали
  // источником): это переякоривает кадр на часы нового источника. При
  // монтировании уже источником публиковать нечего — засеялись тем же, что у
  // сервера и так лежит.
  useEffect(() => {
    const frame = snapshot?.timer;
    if (!frame) return;
    const wasSource = wasSourceRef.current;
    wasSourceRef.current = isSource;
    if (!isSource || wasSource === true) return;
    stateRef.current = applyFrame(
      {
        status: STATUS_FROM_DTO[frame.status],
        remainingCs: frame.remainingCs,
        sampledUnixMs: Number(frame.sampledUnixMs),
        defaultCs: frame.defaultCs || defaultCs,
      },
      live.serverOffsetMs,
      Date.now(),
    );
    if (wasSource === false) publishNow();
  }, [isSource, snapshot?.timer, live.serverOffsetMs, defaultCs, publishNow]);

  // Дефолт арены (персистентный, FR-8) может смениться (правка площадки на
  // лету). Холостой таймер, стоящий ровно на прежнем дефолте, переезжает на
  // новый — иначе на экране остаётся старое время под новой подписью
  // «Длительность: Nс» (полевой баг «1:30 при 60с»). Идущий/поставленный на
  // паузу/истёкший таймер не трогаем — подменять время боя нельзя; равно как
  // и остановленный после ручного ±секунд: это значение секретарь выставил
  // намеренно. Их новый дефолт догонит ближайшим RESET.
  useEffect(() => {
    const prev = stateRef.current;
    if (prev.defaultCs === defaultCs) return;
    const idleAtFullDefault = prev.status === "STOPPED" && prev.remainingCs === prev.defaultCs;
    stateRef.current = idleAtFullDefault
      ? { ...prev, defaultCs, remainingCs: defaultCs, referenceMs: Date.now() }
      : { ...prev, defaultCs };
    if (isSource && idleAtFullDefault) publishNow();
  }, [defaultCs, isSource, publishNow]);

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
