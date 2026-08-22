// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTournamentLive } from "./use-tournament-live";
import type { TournamentLiveSnapshotDto } from "@/entities/tournament-live/lib/types";

const initial: TournamentLiveSnapshotDto = {
  tournamentId: "t1",
  arenas: [],
  bouts: [],
  nominations: [],
  serverNowUnixMs: "0",
};
const updated: TournamentLiveSnapshotDto = {
  tournamentId: "t1",
  arenas: [
    {
      arenaId: "a1",
      arenaName: "Арена 1",
      position: 0,
      state: "bout_in_progress",
      nominationId: "n1",
      nominationName: "Длинный меч",
      poolName: "Пул 1",
      stageTitle: "Группа A",
      currentBout: null,
      poolBoutTotal: 5,
      poolBoutFinished: 2,
    },
  ],
  bouts: [],
  nominations: [],
  serverNowUnixMs: "1000",
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

describe("useTournamentLive", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ snapshot: updated }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns the initial snapshot before any event arrives", () => {
    const { result } = renderHook(() => useTournamentLive(initial, true));
    expect(result.current).toEqual(initial);
  });

  it("opens an EventSource against /api/tournament/live and applies onmessage snapshots", async () => {
    const { result } = renderHook(() => useTournamentLive(initial, true));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/tournament/live");

    FakeEventSource.instances[0].emitMessage(updated);

    await waitFor(() => expect(result.current).toEqual(updated));
  });

  it("falls back to polling after a series of onerror without a successful message", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTournamentLive(initial, true));
    const es = FakeEventSource.instances[0];

    es.emitError();
    es.emitError();
    es.emitError();

    expect(es.close).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current).toEqual(updated);
    expect(global.fetch).toHaveBeenCalledWith("/api/tournament/live-snapshot");
  });

  it("falls back to polling immediately when EventSource is unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", undefined);

    const { result } = renderHook(() => useTournamentLive(initial, true));
    expect(FakeEventSource.instances).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current).toEqual(updated);
  });

  it("cleans up (closes EventSource / clears poll interval) on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useTournamentLive(initial, true));
    const es = FakeEventSource.instances[0];

    unmount();

    expect(es.close).toHaveBeenCalled();

    const fetchCallsBefore = vi.mocked(global.fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(fetchCallsBefore);
  });

  it("does not open an EventSource nor start polling when enabled is false (FR-23)", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTournamentLive(initial, false));

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current).toEqual(initial);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current).toEqual(initial);
  });
});
