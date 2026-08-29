// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useVerifyEmail } from "./use-verify-email";

const verifyEmailRequestMock = vi.fn();
vi.mock("./requests", () => ({
  verifyEmailRequest: (...args: unknown[]) => verifyEmailRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useVerifyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves on ok:true", async () => {
    verifyEmailRequestMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useVerifyEmail(), { wrapper });

    act(() => {
      result.current.mutate("tok-abc");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(verifyEmailRequestMock).toHaveBeenCalledWith("tok-abc");
  });

  it("throws Error with the server message on ok:false", async () => {
    verifyEmailRequestMock.mockResolvedValue({ ok: false, error: "invalid token" });

    const { result } = renderHook(() => useVerifyEmail(), { wrapper });

    act(() => {
      result.current.mutate("bad-tok");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("invalid token");
  });
});
