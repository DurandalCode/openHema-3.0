// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConsole } from "./use-console";
import { emptyConsoleSnapshot } from "@/entities/tournament-console/lib/types";
import type { TournamentConsoleSnapshotDto } from "@/entities/tournament-console/lib/types";

const initial = emptyConsoleSnapshot("t1");
const updated: TournamentConsoleSnapshotDto = {
  ...emptyConsoleSnapshot("t1"),
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

describe("useConsole", () => {
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
    const { result } = renderHook(() => useConsole("t1", initial));
    expect(result.current).toEqual(initial);
  });

  it("opens an EventSource against /api/tournaments/t1/console/stream and applies onmessage snapshots", async () => {
    const { result } = renderHook(() => useConsole("t1", initial));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/tournaments/t1/console/stream");

    act(() => {
      FakeEventSource.instances[0].emitMessage(updated);
    });

    await waitFor(() => {
      expect(result.current).toEqual(updated);
    });
  });

  it("falls back to polling after a series of onerror without a successful message", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useConsole("t1", initial));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.emitError();
      es.emitError();
      es.emitError();
    });
    expect(es.close).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await waitFor(() => {
      expect(result.current).toEqual(updated);
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/tournaments/t1/console");
  });

  it("falls back to polling immediately when EventSource is unavailable", async () => {
    vi.stubGlobal("EventSource", undefined);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useConsole("t1", initial));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await waitFor(() => {
      expect(result.current).toEqual(updated);
    });
  });

  it("cleans up (closes EventSource / clears poll interval) on unmount", async () => {
    const { unmount } = renderHook(() => useConsole("t1", initial));
    const es = FakeEventSource.instances[0];

    unmount();
    expect(es.close).toHaveBeenCalled();
  });
});
