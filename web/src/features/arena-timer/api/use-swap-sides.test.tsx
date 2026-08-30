// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useSwapSides } from "./use-swap-sides";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/arena-timer/api/useSwapSides (0045, T3)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the swapped flag to the arena's scoreboard-sides endpoint", async () => {
    const { result } = renderHook(() => useSwapSides("a1"), { wrapper });

    act(() => {
      result.current.mutate(true);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/arenas/a1/scoreboard-sides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ swapped: true }),
    });
  });

  it("encodes the arena id in the URL", async () => {
    const { result } = renderHook(() => useSwapSides("arena/1"), { wrapper });

    act(() => {
      result.current.mutate(false);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/arenas/arena%2F1/scoreboard-sides",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
