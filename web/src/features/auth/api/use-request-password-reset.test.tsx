// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useRequestPasswordReset } from "./use-request-password-reset";

const requestPasswordResetMock = vi.fn();
vi.mock("./requests", () => ({
  requestPasswordReset: (...args: unknown[]) =>
    requestPasswordResetMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/auth/api/useRequestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls requestPasswordReset and resolves on ok:true", async () => {
    requestPasswordResetMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useRequestPasswordReset(), {
      wrapper,
    });

    act(() => {
      result.current.mutate("ivan@example.com");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestPasswordResetMock).toHaveBeenCalledWith(
      "ivan@example.com",
    );
  });

  it("throws Error with server message on ok:false", async () => {
    requestPasswordResetMock.mockResolvedValue({
      ok: false,
      error: "Ошибка запроса",
    });

    const { result } = renderHook(() => useRequestPasswordReset(), {
      wrapper,
    });

    act(() => {
      result.current.mutate("ivan@example.com");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Ошибка запроса");
  });
});
