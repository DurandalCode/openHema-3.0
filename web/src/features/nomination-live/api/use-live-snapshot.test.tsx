// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useLiveSnapshot } from "./use-live-snapshot";
import { nominationLiveKeys } from "./keys";

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("features/nomination-live/api/useLiveSnapshot (спека 0032, T8)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /api/nominations/[id]/live-snapshot under the query key and returns the snapshot", async () => {
    const snapshot = { nominationId: "n1", pools: [], stages: [], brackets: [], results: null };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ snapshot }) });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLiveSnapshot("n1"), { wrapper: wrapperFor(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/live-snapshot");
    expect(qc.getQueryData(nominationLiveKeys.snapshot("n1"))).toEqual(snapshot);
  });

  it("returns null data when the nomination has no live snapshot yet (draft layout)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ snapshot: null }) });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLiveSnapshot("n1"), { wrapper: wrapperFor(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("surfaces a server error message on non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not found" }) });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLiveSnapshot("n1"), { wrapper: wrapperFor(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("not found"));
  });

  it("surfaces a network error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLiveSnapshot("n1"), { wrapper: wrapperFor(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("network"));
  });

  it("does not fetch when nominationId is empty", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useLiveSnapshot(""), { wrapper: wrapperFor(qc) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
