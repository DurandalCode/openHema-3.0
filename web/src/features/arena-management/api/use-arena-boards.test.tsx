// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Arena } from "@/entities/arena/lib/types";
import { useArenaBoards } from "./use-arena-boards";

const getArenaBoardsRequestMock = vi.fn();
vi.mock("./requests", () => ({
  getArenaBoardsRequest: (...args: unknown[]) => getArenaBoardsRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function arena(id: string): Arena {
  return { id, name: id, status: "ARENA_STATUS_ACTIVE" } as Arena;
}

describe("features/arena-management/api/useArenaBoards", () => {
  it("fetches all boards in one aggregated request, not one per arena", async () => {
    getArenaBoardsRequestMock.mockResolvedValue({
      ok: true,
      entries: [
        { arenaId: "a1", board: null },
        { arenaId: "a2", board: { pool: { id: "p1" }, bouts: [], currentBoutId: "" } },
      ],
    });

    const { result } = renderHook(() => useArenaBoards("t1", [arena("a1"), arena("a2")]), {
      wrapper,
    });

    await waitFor(() => expect(result.current.get("a1")?.status.kind).toBe("free"));

    expect(getArenaBoardsRequestMock).toHaveBeenCalledTimes(1);
    expect(getArenaBoardsRequestMock).toHaveBeenCalledWith("t1");
    expect(result.current.get("a1")).toEqual({
      status: { kind: "free", title: "Свободна", detail: null, pulse: false },
      isError: false,
    });
    expect(result.current.get("a2")?.isError).toBe(false);
  });

  it("returns unknown status before the first response resolves", () => {
    getArenaBoardsRequestMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useArenaBoards("t1", [arena("a1")]), { wrapper });

    expect(result.current.get("a1")).toEqual({
      status: { kind: "unknown", title: "—", detail: null, pulse: false },
      isError: false,
    });
  });

  it("returns unknown status for an arena missing from the response entries", async () => {
    getArenaBoardsRequestMock.mockResolvedValue({
      ok: true,
      entries: [{ arenaId: "a1", board: null }],
    });

    const { result } = renderHook(() => useArenaBoards("t1", [arena("a1"), arena("a2")]), {
      wrapper,
    });

    await waitFor(() => expect(result.current.get("a1")?.status.kind).toBe("free"));
    expect(result.current.get("a2")).toEqual({
      status: { kind: "unknown", title: "—", detail: null, pulse: false },
      isError: false,
    });
  });

  it("marks every arena isError:true when the aggregated request fails (shared, not per-arena)", async () => {
    getArenaBoardsRequestMock.mockResolvedValue({ ok: false, error: "boom" });

    const { result } = renderHook(() => useArenaBoards("t1", [arena("a1"), arena("a2")]), {
      wrapper,
    });

    await waitFor(() => expect(result.current.get("a1")?.isError).toBe(true));
    expect(result.current.get("a2")?.isError).toBe(true);
  });
});
