// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Pool } from "@/entities/pool/lib/types";
import { useDequeuePool } from "./use-dequeue-pool";
import { useEnqueuePool } from "./use-enqueue-pool";
import { useReorderArenaQueue } from "./use-reorder-arena-queue";
import { useSeatNextPool } from "./use-seat-next-pool";
import { poolSeatingKeys } from "./keys";

const requests = vi.hoisted(() => ({
  enqueuePoolRequest: vi.fn(),
  dequeuePoolRequest: vi.fn(),
  reorderArenaQueueRequest: vi.fn(),
  seatNextPoolRequest: vi.fn(),
}));
vi.mock("./requests", () => requests);

const pool = (id: string): Pool => ({ id }) as Pool;
const state = { seated: null, available: [pool("p9")], queued: [pool("p1"), pool("p2")] };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("features/pool-seating/api queue mutations (спека 0063)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useEnqueuePool writes the returned arena state into the cache of that arena", async () => {
    requests.enqueuePoolRequest.mockResolvedValue({ ok: true, ...state });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useEnqueuePool("a1"), { wrapper });

    act(() => result.current.mutate("p1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(requests.enqueuePoolRequest).toHaveBeenCalledWith("p1", "a1");
    expect(qc.getQueryData(poolSeatingKeys.forArena("a1"))).toEqual(state);
  });

  it("invalidates other arenas' caches (a transfer changes the old arena's queue) but not the written one", async () => {
    requests.enqueuePoolRequest.mockResolvedValue({ ok: true, ...state });
    const { qc, wrapper } = setup();
    qc.setQueryData(poolSeatingKeys.forArena("a2"), { seated: null, available: [], queued: [pool("p1")] });
    const { result } = renderHook(() => useEnqueuePool("a1"), { wrapper });

    act(() => result.current.mutate("p1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryState(poolSeatingKeys.forArena("a2"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(poolSeatingKeys.forArena("a1"))?.isInvalidated).toBe(false);
  });

  it("useDequeuePool writes the returned state", async () => {
    requests.dequeuePoolRequest.mockResolvedValue({ ok: true, ...state });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useDequeuePool("a1"), { wrapper });

    act(() => result.current.mutate("p1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(requests.dequeuePoolRequest).toHaveBeenCalledWith("p1");
    expect(qc.getQueryData(poolSeatingKeys.forArena("a1"))).toEqual(state);
  });

  it("useReorderArenaQueue sends the full ordered list and writes the state", async () => {
    requests.reorderArenaQueueRequest.mockResolvedValue({ ok: true, ...state });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useReorderArenaQueue("a1"), { wrapper });

    act(() => result.current.mutate(["p2", "p1"]));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(requests.reorderArenaQueueRequest).toHaveBeenCalledWith("a1", ["p2", "p1"]);
    expect(qc.getQueryData(poolSeatingKeys.forArena("a1"))).toEqual(state);
  });

  it("useSeatNextPool seats the head of the queue and writes the state", async () => {
    const seated = { ...state, seated: pool("p1"), queued: [pool("p2")] };
    requests.seatNextPoolRequest.mockResolvedValue({ ok: true, ...seated });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useSeatNextPool("a1"), { wrapper });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(requests.seatNextPoolRequest).toHaveBeenCalledWith("a1");
    expect(qc.getQueryData(poolSeatingKeys.forArena("a1"))).toEqual(seated);
  });

  it("throws the server error and leaves the cache untouched on failure", async () => {
    requests.seatNextPoolRequest.mockResolvedValue({ ok: false, error: "очередь пуста" });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useSeatNextPool("a1"), { wrapper });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("очередь пуста");
    expect(qc.getQueryData(poolSeatingKeys.forArena("a1"))).toBeUndefined();
  });
});
