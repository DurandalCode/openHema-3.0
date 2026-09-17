// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArenaTimer } from "./use-arena-timer";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import type { ArenaLiveSnapshotDto, TimerCommandDto } from "@/entities/arena-live/lib/types";
import { useSessionExpiredStore } from "@/shared/lib/session-expired-store";
import { resetSilentRefreshStateForTests } from "@/shared/lib/silent-refresh";

const T0 = 1_700_000_000_000;
// Зеркало DISPLAY_THROTTLE_MS из хука: setDisplay реже ~10 раз/сек.
const DISPLAY_THROTTLE_MS = 100;

function makeLive(
  snapshot: ArenaLiveSnapshotDto | null,
  serverOffsetMs = 0,
): { live: UseArenaLiveResult; listeners: Set<(command: TimerCommandDto) => void> } {
  const listeners = new Set<(command: TimerCommandDto) => void>();
  return {
    live: {
      snapshot,
      serverOffsetMs,
      onCommand: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      // connection/lostSinceMs/reconnect (спека 0033, T21) — не под тестом
      // здесь; заполнены нейтральными значениями только чтобы удовлетворить
      // расширенный тип `UseArenaLiveResult`.
      connection: "live",
      lostSinceMs: null,
      reconnect: () => {},
    },
    listeners,
  };
}

function sourceSnapshot(defaultDurationSeconds = 90, currentBoutId = ""): ArenaLiveSnapshotDto {
  return {
    board: { pool: null, bouts: [], currentBoutId },
    timer: { status: "TIMER_STATUS_STOPPED", remainingCs: defaultDurationSeconds * 100, sampledUnixMs: "0", defaultCs: defaultDurationSeconds * 100 },
    room: { scoreboardCount: 1, thisOrdinal: 1, thisIsSource: true, sidesSwapped: false, revealGeneration: 0 },
    defaultDurationSeconds,
    serverNowUnixMs: "0",
  };
}

function followerSnapshot(status: ArenaLiveSnapshotDto["timer"]["status"], remainingCs: number, sampledUnixMs: number): ArenaLiveSnapshotDto {
  return {
    board: { pool: null, bouts: [], currentBoutId: "" },
    timer: { status, remainingCs, sampledUnixMs: String(sampledUnixMs), defaultCs: 9000 },
    room: { scoreboardCount: 2, thisOrdinal: 2, thisIsSource: false, sidesSwapped: false, revealGeneration: 0 },
    defaultDurationSeconds: 90,
    serverNowUnixMs: String(sampledUnixMs),
  };
}

/**
 * panelSourceSnapshot — панель, ставшая источником, потому что табло в
 * комнате нет (scoreboardCount 0 + thisIsSource). Timer в нём — тот самый
 * закешированный кадр комнаты, которым новый источник обязан засеяться.
 */
function panelSourceSnapshot(
  status: ArenaLiveSnapshotDto["timer"]["status"],
  remainingCs: number,
  sampledUnixMs: number,
  defaultDurationSeconds = 90,
): ArenaLiveSnapshotDto {
  return {
    board: { pool: null, bouts: [], currentBoutId: "" },
    timer: { status, remainingCs, sampledUnixMs: String(sampledUnixMs), defaultCs: defaultDurationSeconds * 100 },
    room: { scoreboardCount: 0, thisOrdinal: 0, thisIsSource: true, sidesSwapped: false, revealGeneration: 0 },
    defaultDurationSeconds,
    serverNowUnixMs: String(sampledUnixMs),
  };
}

describe("useArenaTimer", () => {
  let now = T0;
  // Map, а не массив: cancelAnimationFrame обязан реально отменять кадр —
  // иначе rAF-цикл, заведённый прошлым эффектом (например с isSource=true),
  // переживает перерендер и продолжает публиковать кадры параллельно новому.
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;

  beforeEach(() => {
    now = T0;
    rafCallbacks = new Map();
    nextRafId = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      nextRafId += 1;
      rafCallbacks.set(nextRafId, cb);
      return nextRafId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafCallbacks.delete(id);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ snapshot: null }) })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useSessionExpiredStore.getState().close();
    // Модульное состояние silent-refresh (in-flight + cooldown) делится со
    // всеми импортёрами и Date.now() здесь замокан — без сброса cooldown
    // протёк бы в следующий тест.
    resetSilentRefreshStateForTests();
  });

  function flushRaf() {
    const pending = [...rafCallbacks.values()];
    rafCallbacks.clear();
    pending.forEach((cb) => cb(now));
  }

  function refreshCalls() {
    return vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) => String(url).includes("/api/auth/refresh"));
  }

  function timerFrameCalls() {
    return vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) => String(url).includes("/timer-frame"));
  }

  it("as source: applies an incoming START command and publishes a frame immediately", async () => {
    const { live, listeners } = makeLive(sourceSnapshot(90));
    renderHook(() => useArenaTimer("a1", live));
    flushRaf(); // establish the rAF loop

    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });

    const calls = timerFrameCalls();
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1]!.body as string);
    expect(body).toEqual({ status: "TIMER_STATUS_RUNNING", remainingCs: 9000, sampledUnixMs: T0, defaultCs: 9000 });
  });

  it("as source: publishes a frame roughly every 200ms while RUNNING", async () => {
    const { live, listeners } = makeLive(sourceSnapshot(90));
    renderHook(() => useArenaTimer("a1", live));
    flushRaf();

    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });
    expect(timerFrameCalls()).toHaveLength(1); // immediate publish on START

    now += 250;
    await act(async () => {
      flushRaf();
    });
    expect(timerFrameCalls().length).toBeGreaterThanOrEqual(2);

    now += 250;
    await act(async () => {
      flushRaf();
    });
    expect(timerFrameCalls().length).toBeGreaterThanOrEqual(3);
  });

  it("as source: publishes immediately on the RUNNING → EXPIRED transition", async () => {
    const { live, listeners } = makeLive(sourceSnapshot(1)); // defaultCs = 100
    renderHook(() => useArenaTimer("a1", live));
    flushRaf();

    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });

    now += 1200; // well past the 1s default
    await act(async () => {
      flushRaf();
    });

    const calls = timerFrameCalls();
    const lastBody = JSON.parse(calls[calls.length - 1][1]!.body as string);
    expect(lastBody.status).toBe("TIMER_STATUS_EXPIRED");
    expect(lastBody.remainingCs).toBe(0);
  });

  it("as source: resets to default and pauses when the current bout id changes (FR-15/AC-11)", async () => {
    const { live, listeners } = makeLive(sourceSnapshot(90, "bout-1"));
    const { rerender } = renderHook(({ live: l }) => useArenaTimer("a1", l), {
      initialProps: { live },
    });
    flushRaf();

    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });

    now += 3000;
    const { live: live2 } = makeLive(sourceSnapshot(90, "bout-2"));
    live2.onCommand = live.onCommand; // keep the same listener set (unused here)
    await act(async () => {
      rerender({ live: live2 });
    });

    const calls = timerFrameCalls();
    const lastBody = JSON.parse(calls[calls.length - 1][1]!.body as string);
    expect(lastBody.status).toBe("TIMER_STATUS_PAUSED");
    expect(lastBody.remainingCs).toBe(9000);
  });

  it("as follower: never publishes timer-frame, only reflects incoming snapshot frames", async () => {
    const { live } = makeLive(followerSnapshot("TIMER_STATUS_RUNNING", 8900, T0));
    renderHook(() => useArenaTimer("a1", live));

    for (let i = 0; i < 5; i += 1) {
      now += 100;
      await act(async () => {
        flushRaf();
      });
    }

    expect(timerFrameCalls()).toHaveLength(0);
  });

  it("controls.* POST to /api/arenas/{id}/timer regardless of source/follower role", async () => {
    const { live } = makeLive(followerSnapshot("TIMER_STATUS_STOPPED", 9000, T0));
    const { result } = renderHook(() => useArenaTimer("a1", live));

    await act(async () => {
      result.current.controls.start();
    });
    await act(async () => {
      result.current.controls.pause();
    });
    await act(async () => {
      result.current.controls.reset();
    });
    await act(async () => {
      result.current.controls.adjust(-3);
    });

    const calls = vi.mocked(global.fetch).mock.calls.filter(([url]) => String(url).endsWith("/timer"));
    expect(calls).toHaveLength(4);
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ kind: "START", amountSeconds: undefined });
    expect(JSON.parse(calls[3][1]!.body as string)).toEqual({ kind: "ADJUST", amountSeconds: -3 });
    calls.forEach(([url]) => expect(url).toBe("/api/arenas/a1/timer"));
  });

  it("as panel fallback source: applies an incoming START and publishes, exactly like a scoreboard", async () => {
    const { live, listeners } = makeLive(panelSourceSnapshot("TIMER_STATUS_STOPPED", 9000, 0));
    renderHook(() => useArenaTimer("a1", live));
    flushRaf();

    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });

    const calls = timerFrameCalls();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({
      status: "TIMER_STATUS_RUNNING",
      remainingCs: 9000,
      sampledUnixMs: T0,
      defaultCs: 9000,
    });
  });

  it("on promotion to source: seeds from the room frame and republishes it, instead of resetting to the default", async () => {
    const { live } = makeLive(followerSnapshot("TIMER_STATUS_RUNNING", 4500, T0));
    const { rerender } = renderHook(({ live: l }) => useArenaTimer("a1", l), {
      initialProps: { live },
    });
    flushRaf();
    expect(timerFrameCalls()).toHaveLength(0);

    // Табло ушло — сервер повысил эту панель в источники, отдав ей свой
    // последний кадр (4500сс идущего боя).
    const { live: promoted } = makeLive(panelSourceSnapshot("TIMER_STATUS_RUNNING", 4500, T0));
    await act(async () => {
      rerender({ live: promoted });
    });

    const calls = timerFrameCalls();
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1]!.body as string);
    expect(body.status).toBe("TIMER_STATUS_RUNNING");
    expect(body.remainingCs).toBe(4500);
  });

  it("does not publish when it mounts already as the source — the seeded frame is the server's own", async () => {
    const { live } = makeLive(null);
    const { rerender } = renderHook(({ live: l }) => useArenaTimer("a1", l), {
      initialProps: { live },
    });
    await act(async () => {
      flushRaf();
    });

    const { live: first } = makeLive(panelSourceSnapshot("TIMER_STATUS_RUNNING", 4500, T0));
    await act(async () => {
      rerender({ live: first });
      flushRaf();
    });

    expect(timerFrameCalls()).toHaveLength(0);
  });

  it("on demotion: stops publishing once a scoreboard takes the source over", async () => {
    const { live, listeners } = makeLive(sourceSnapshot(90));
    const { rerender } = renderHook(({ live: l }) => useArenaTimer("a1", l), {
      initialProps: { live },
    });
    flushRaf();
    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });

    const { live: demoted } = makeLive(followerSnapshot("TIMER_STATUS_RUNNING", 8900, T0));
    await act(async () => {
      rerender({ live: demoted });
    });
    const afterDemotion = timerFrameCalls().length;

    for (let i = 0; i < 5; i += 1) {
      now += 300;
      await act(async () => {
        flushRaf();
      });
    }

    expect(timerFrameCalls()).toHaveLength(afterDemotion);
  });

  it("rebases the remaining time when the arena default changes while the timer is idle", async () => {
    const { live } = makeLive(sourceSnapshot(90));
    const { result, rerender } = renderHook(({ live: l }) => useArenaTimer("a1", l), {
      initialProps: { live },
    });
    flushRaf();

    const { live: shorter } = makeLive(sourceSnapshot(60));
    await act(async () => {
      rerender({ live: shorter });
    });
    // display троттлится до ~10 раз/сек — двигаем часы, иначе setDisplay
    // пропускается и мы прочитали бы значение прошлого кадра.
    now += DISPLAY_THROTTLE_MS;
    await act(async () => {
      flushRaf();
    });

    expect(result.current.display.remainingCs).toBe(6000);
    const calls = timerFrameCalls();
    expect(calls.length).toBeGreaterThan(0);
    const body = JSON.parse(calls[calls.length - 1][1]!.body as string);
    expect(body).toMatchObject({ status: "TIMER_STATUS_STOPPED", remainingCs: 6000, defaultCs: 6000 });
  });

  it("keeps the running value when the arena default changes mid-bout", async () => {
    const { live, listeners } = makeLive(sourceSnapshot(90));
    const { rerender } = renderHook(({ live: l }) => useArenaTimer("a1", l), {
      initialProps: { live },
    });
    flushRaf();
    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });

    now += 3000;
    const { live: shorter } = makeLive(sourceSnapshot(60));
    await act(async () => {
      rerender({ live: shorter });
      flushRaf();
    });

    const calls = timerFrameCalls();
    const body = JSON.parse(calls[calls.length - 1][1]!.body as string);
    expect(body.status).toBe("TIMER_STATUS_RUNNING");
    expect(body.remainingCs).not.toBe(6000);
  });

  it("as follower: does not publish when the arena default changes", async () => {
    const { live } = makeLive(followerSnapshot("TIMER_STATUS_STOPPED", 9000, T0));
    const { rerender } = renderHook(({ live: l }) => useArenaTimer("a1", l), {
      initialProps: { live },
    });
    flushRaf();

    const shorter = followerSnapshot("TIMER_STATUS_STOPPED", 6000, T0);
    shorter.defaultDurationSeconds = 60;
    shorter.timer.defaultCs = 6000;
    const { live: shorterLive } = makeLive(shorter);
    await act(async () => {
      rerender({ live: shorterLive });
      flushRaf();
    });

    expect(timerFrameCalls()).toHaveLength(0);
  });

  // Раньше эти два пути открывали диалог НЕМЕДЛЕННО, минуя тихое продление,
  // которое давно есть у обычных запросов (query-client). На консоли арены
  // это и был самый громкий источник «постоянно сбрасывается сессия»: кадр
  // таймера уходит каждые ~200мс, и первый же после истечения access-куки
  // выбрасывал секретаря.
  it("tries a silent refresh before the dialog when a command POST comes back 401", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes("/api/auth/refresh")
        ? { ok: true, json: async () => ({ ok: true }) }
        : { ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { live } = makeLive(followerSnapshot("TIMER_STATUS_STOPPED", 9000, T0));
    const { result } = renderHook(() => useArenaTimer("a1", live));

    await act(async () => {
      result.current.controls.start();
    });

    expect(refreshCalls()).toHaveLength(1);
  });

  it("retries a control command once after a successful silent refresh", async () => {
    let timerPosts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes("/api/auth/refresh")) {
          return { ok: true, json: async () => ({ ok: true }) };
        }
        timerPosts += 1;
        return timerPosts === 1
          ? { ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) }
          : { ok: true, json: async () => ({ snapshot: null }) };
      }),
    );
    const { live } = makeLive(followerSnapshot("TIMER_STATUS_STOPPED", 9000, T0));
    const { result } = renderHook(() => useArenaTimer("a1", live));

    await act(async () => {
      result.current.controls.start();
    });

    // Первая попытка + ретрай: команда судьи не должна потеряться.
    expect(timerPosts).toBe(2);
    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
  });

  it("opens the dialog when the command 401s and the silent refresh also fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) })),
    );
    const { live } = makeLive(followerSnapshot("TIMER_STATUS_STOPPED", 9000, T0));
    const { result } = renderHook(() => useArenaTimer("a1", live));

    await act(async () => {
      result.current.controls.start();
    });

    expect(useSessionExpiredStore.getState().isOpen).toBe(true);
  });

  it("opens the dialog when a timer-frame publish 401s and the silent refresh also fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) })),
    );
    const { live, listeners } = makeLive(sourceSnapshot(90));
    renderHook(() => useArenaTimer("a1", live));
    flushRaf();

    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });

    expect(useSessionExpiredStore.getState().isOpen).toBe(true);
  });

  // Кадры идут 5 раз/сек — без cooldown это была бы лавина обречённых
  // POST /api/auth/refresh на всё время, пока сессия мертва.
  it("does not storm /api/auth/refresh while frames keep coming back 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) })),
    );
    const { live, listeners } = makeLive(sourceSnapshot(90));
    renderHook(() => useArenaTimer("a1", live));
    flushRaf();
    await act(async () => {
      listeners.forEach((l) => l({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 }));
    });

    for (let i = 0; i < 20; i += 1) {
      now += 200;
      await act(async () => {
        flushRaf();
      });
    }

    expect(refreshCalls()).toHaveLength(1);
  });
});
