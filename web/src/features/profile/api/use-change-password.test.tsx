// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useChangePassword } from "./use-change-password";

const changePasswordRequestMock = vi.fn();
vi.mock("./requests", () => ({
  changePasswordRequest: (...args: unknown[]) => changePasswordRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useChangePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves on ok:true", async () => {
    changePasswordRequestMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useChangePassword(), { wrapper });

    act(() => {
      result.current.mutate({ currentPassword: "old12345", newPassword: "new12345" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("throws Error with server message on ok:false (e.g. wrong current password)", async () => {
    changePasswordRequestMock.mockResolvedValue({
      ok: false,
      error: "неверный текущий пароль",
    });

    const { result } = renderHook(() => useChangePassword(), { wrapper });

    act(() => {
      result.current.mutate({ currentPassword: "wrong", newPassword: "new12345" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("неверный текущий пароль");
  });
});
