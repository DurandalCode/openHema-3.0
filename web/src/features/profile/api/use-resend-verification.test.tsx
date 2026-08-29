// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useResendVerification } from "./use-resend-verification";

const resendEmailVerificationRequestMock = vi.fn();
vi.mock("./requests", () => ({
  resendEmailVerificationRequest: (...args: unknown[]) => resendEmailVerificationRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useResendVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves on ok:true", async () => {
    resendEmailVerificationRequestMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useResendVerification(), { wrapper });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("throws Error with the throttling message on 429 (FR-4)", async () => {
    resendEmailVerificationRequestMock.mockResolvedValue({
      ok: false,
      error: "слишком много попыток, попробуйте позже",
    });

    const { result } = renderHook(() => useResendVerification(), { wrapper });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("слишком много попыток, попробуйте позже");
  });
});
