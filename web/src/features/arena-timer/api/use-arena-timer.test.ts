// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArenaTimer } from "./use-arena-timer";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import type { ArenaLiveSnapshotDto, TimerCommandDto } from "@/entities/arena-live/lib/types";
import { useSessionExpiredStore } from "@/shared/lib/session-expired-store";

const T0 = 1_700_000_000_000;

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

describe("useArenaTimer", () => {
  let now = T0;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    now = T0;
    rafCallbacks = [];
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ snapshot: null }) })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useSessionExpiredStore.getState().close();
  });

  function flushRaf() {
    const pending = rafCallbacks.splice(0, rafCallbacks.length);
    pending.forEach((cb) => cb(now));
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

  it("opens the global 'session expired' dialog when a command POST comes back 401 (spec 0039, FR-17)", async () => {
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

  it("opens the global 'session expired' dialog when a timer-frame publish comes back 401 (spec 0039, FR-17)", async () => {
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
});
