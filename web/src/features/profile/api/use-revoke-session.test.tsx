// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useRevokeSession } from "./use-revoke-session";
import { profileKeys } from "./keys";

const revokeSessionRequestMock = vi.fn();
vi.mock("./requests", () => ({
  revokeSessionRequest: (...args: unknown[]) => revokeSessionRequestMock(...args),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("features/profile/api/useRevokeSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates the sessions list on success (FR-12)", async () => {
    revokeSessionRequestMock.mockResolvedValue({ ok: true });
    const { wrapper, invalidateSpy } = makeWrapper();

    const { result } = renderHook(() => useRevokeSession(), { wrapper });

    act(() => {
      result.current.mutate("s1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(revokeSessionRequestMock).toHaveBeenCalledWith("s1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: profileKeys.sessions });
  });

  it("throws Error on a foreign session (403)", async () => {
    revokeSessionRequestMock.mockResolvedValue({ ok: false, error: "not your session" });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useRevokeSession(), { wrapper });

    act(() => {
      result.current.mutate("someone-elses");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
