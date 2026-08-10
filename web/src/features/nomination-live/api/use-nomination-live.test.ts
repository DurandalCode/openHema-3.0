// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNominationLive } from "./use-nomination-live";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import { emptyNominationResults } from "@/entities/nomination-results/lib/types";

const initial: NominationLiveSnapshotDto = {
  nominationId: "n1",
  pools: [],
  stages: [],
  brackets: [],
  results: emptyNominationResults("n1"),
};
const updated: NominationLiveSnapshotDto = {
  nominationId: "n1",
  brackets: [],
  results: emptyNominationResults("n1"),
  pools: [
    {
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
        standings: [],
      },
      bouts: [],
      currentBoutId: "",
    },
  ],
  stages: [
    {
      id: "stage-1",
      nominationId: "n1",
      position: 0,
      title: "Групповой этап",
      type: "STAGE_TYPE_GROUPS",
      status: "POOL_LAYOUT_STATUS_READY",
      bracket: null,
      groups: null,
      rule: null,
    },
  ],
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

describe("useNominationLive", () => {
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
    const { result } = renderHook(() => useNominationLive("n1", initial));
    expect(result.current).toEqual(initial);
  });

  it("opens an EventSource against /api/nominations/{id}/live and applies onmessage snapshots", async () => {
    const { result } = renderHook(() => useNominationLive("n1", initial));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/nominations/n1/live");

    FakeEventSource.instances[0].emitMessage(updated);

    await waitFor(() => expect(result.current).toEqual(updated));
  });

  it("falls back to polling after a series of onerror without a successful message", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNominationLive("n1", initial));
    const es = FakeEventSource.instances[0];

    es.emitError();
    es.emitError();
    es.emitError();

    expect(es.close).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current).toEqual(updated);
    expect(global.fetch).toHaveBeenCalledWith("/api/nominations/n1/live-snapshot");
  });

  it("falls back to polling immediately when EventSource is unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", undefined);

    const { result } = renderHook(() => useNominationLive("n1", initial));
    expect(FakeEventSource.instances).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current).toEqual(updated);
  });

  it("cleans up (closes EventSource / clears poll interval) on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useNominationLive("n1", initial));
    const es = FakeEventSource.instances[0];

    unmount();

    expect(es.close).toHaveBeenCalled();

    const fetchCallsBefore = vi.mocked(global.fetch).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(fetchCallsBefore);
  });
});
