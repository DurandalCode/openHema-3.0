// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useResetPassword } from "./use-reset-password";

const resetPasswordMock = vi.fn();
vi.mock("./requests", () => ({
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/auth/api/useResetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls resetPassword and resolves on ok:true", async () => {
    resetPasswordMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useResetPassword(), { wrapper });

    act(() => {
      result.current.mutate({ token: "tok", password: "newpassword1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(resetPasswordMock).toHaveBeenCalledWith({
      token: "tok",
      password: "newpassword1",
    });
  });

  it("throws Error with server message on ok:false (invalid/expired token)", async () => {
    resetPasswordMock.mockResolvedValue({
      ok: false,
      error: "ссылка недействительна или устарела",
    });

    const { result } = renderHook(() => useResetPassword(), { wrapper });

    act(() => {
      result.current.mutate({ token: "bad", password: "newpassword1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "ссылка недействительна или устарела",
    );
  });
});
