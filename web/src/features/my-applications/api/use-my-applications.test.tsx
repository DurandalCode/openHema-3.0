// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useMyApplications } from "./use-my-applications";

const listMyApplicationsRequestMock = vi.fn();
vi.mock("./requests", () => ({
  listMyApplicationsRequest: (...args: unknown[]) => listMyApplicationsRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/my-applications/api/useMyApplications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches by default (no options — existing callers keep working unchanged)", async () => {
    listMyApplicationsRequestMock.mockResolvedValue({ ok: true, applications: [] });

    const { result } = renderHook(() => useMyApplications(), { wrapper });

    await waitFor(() => expect(listMyApplicationsRequestMock).toHaveBeenCalled());
  });

  it("does not fetch when enabled:false (spec 0036: guest visiting a public nomination page)", async () => {
    listMyApplicationsRequestMock.mockResolvedValue({ ok: true, applications: [] });

    const { result } = renderHook(() => useMyApplications({ enabled: false }), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(listMyApplicationsRequestMock).not.toHaveBeenCalled();
  });
});
