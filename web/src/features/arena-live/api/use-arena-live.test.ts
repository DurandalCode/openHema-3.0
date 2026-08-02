// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArenaLive } from "./use-arena-live";
import type { ArenaLiveSnapshotDto } from "@/entities/arena-live/lib/types";
import type { BoutBoard } from "@/entities/pool/lib/types";

const initialBoard: BoutBoard = {
  pool: {
    id: "p1",
    nominationId: "n1",
    nominationName: "Longsword",
    number: 1,
    name: "Пул 1",
    members: [],
    status: "POOL_STATUS_ACTIVE",
    arenaId: "a1",
    arenaName: "Ристалище 1",
  },
  bouts: [],
  currentBoutId: "",
};

const snapshot: ArenaLiveSnapshotDto = {
  board: initialBoard,
  timer: { status: "TIMER_STATUS_RUNNING", remainingCs: 8900, sampledUnixMs: "1700000000000", defaultCs: 9000 },
  room: { scoreboardCount: 1, thisOrdinal: 1, thisIsSource: true, sidesSwapped: false, revealGeneration: 0 },
  defaultDurationSeconds: 90,
  serverNowUnixMs: "1700000000500",
};

/** FakeEventSource — минимальный контролируемый мок native EventSource. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  emitError() {
    this.onerror?.();
  }
}

describe("useArenaLive", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ board: initialBoard }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("seeds the snapshot from initialBoard before any event arrives", () => {
    const { result } = renderHook(() => useArenaLive("a1", "scoreboard", initialBoard));
    expect(result.current.snapshot?.board).toEqual(initialBoard);
    expect(result.current.serverOffsetMs).toBe(0);
  });

  it("opens an EventSource against /api/arenas/{id}/live?role=... and applies snapshot frames", async () => {
    const { result } = renderHook(() => useArenaLive("a1", "scoreboard", null));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/arenas/a1/live?role=scoreboard");

    FakeEventSource.instances[0].emitMessage({ type: "snapshot", snapshot });

    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  });

  it("computes serverOffsetMs from the snapshot's serverNowUnixMs on each snapshot frame", async () => {
    vi.setSystemTime(1_700_000_000_200);
    const { result } = renderHook(() => useArenaLive("a1", "panel", null));

    FakeEventSource.instances[0].emitMessage({ type: "snapshot", snapshot });

    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    // serverNowUnixMs (1700000000500) - Date.now() (1700000000200) = 300
    expect(result.current.serverOffsetMs).toBe(300);
    vi.useRealTimers();
  });

  it("dispatches command frames to onCommand subscribers without touching snapshot", async () => {
    const { result } = renderHook(() => useArenaLive("a1", "panel", initialBoard));
    const received: unknown[] = [];
    const unsubscribe = result.current.onCommand((cmd) => received.push(cmd));

    const snapshotBefore = result.current.snapshot;
    FakeEventSource.instances[0].emitMessage({
      type: "command",
      command: { kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 },
    });

    await waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({ kind: "TIMER_COMMAND_KIND_START", amountSeconds: 0 });
    expect(result.current.snapshot).toEqual(snapshotBefore);

    unsubscribe();
  });

  it("falls back to polling /board after a series of onerror without a successful message", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useArenaLive("a1", "scoreboard", null));
    const es = FakeEventSource.instances[0];

    es.emitError();
    es.emitError();
    es.emitError();

    expect(es.close).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.snapshot?.board).toEqual(initialBoard);
    expect(global.fetch).toHaveBeenCalledWith("/api/arenas/a1/board");
  });

  it("cleans up (closes EventSource / clears poll interval) on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useArenaLive("a1", "scoreboard", null));
    const es = FakeEventSource.instances[0];

    unmount();

    expect(es.close).toHaveBeenCalled();

    const fetchCallsBefore = vi.mocked(global.fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(fetchCallsBefore);
  });
});
