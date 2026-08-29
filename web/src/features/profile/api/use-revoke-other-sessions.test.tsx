// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useRevokeOtherSessions } from "./use-revoke-other-sessions";
import { profileKeys } from "./keys";

const revokeOtherSessionsRequestMock = vi.fn();
vi.mock("./requests", () => ({
  revokeOtherSessionsRequest: (...args: unknown[]) => revokeOtherSessionsRequestMock(...args),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("features/profile/api/useRevokeOtherSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with revokedCount and invalidates the sessions list (AC-7)", async () => {
    revokeOtherSessionsRequestMock.mockResolvedValue({ ok: true, revokedCount: 2 });
    const { wrapper, invalidateSpy } = makeWrapper();

    const { result } = renderHook(() => useRevokeOtherSessions(), { wrapper });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(2);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: profileKeys.sessions });
  });
});
