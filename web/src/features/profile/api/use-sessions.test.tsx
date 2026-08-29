// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useSessions } from "./use-sessions";

const listSessionsRequestMock = vi.fn();
vi.mock("./requests", () => ({
  listSessionsRequest: (...args: unknown[]) => listSessionsRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with the session list on ok:true", async () => {
    const sessions = [
      { id: "s1", createdAt: "2026-08-01T00:00:00.000Z", lastSeenAt: "2026-08-28T00:00:00.000Z", current: true },
    ];
    listSessionsRequestMock.mockResolvedValue({ ok: true, sessions });

    const { result } = renderHook(() => useSessions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sessions);
  });

  it("surfaces an error on ok:false", async () => {
    listSessionsRequestMock.mockResolvedValue({ ok: false, error: "internal error" });

    const { result } = renderHook(() => useSessions(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
