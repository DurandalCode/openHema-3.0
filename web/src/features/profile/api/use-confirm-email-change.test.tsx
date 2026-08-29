// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useConfirmEmailChange } from "./use-confirm-email-change";

const confirmEmailChangeRequestMock = vi.fn();
vi.mock("./requests", () => ({
  confirmEmailChangeRequest: (...args: unknown[]) => confirmEmailChangeRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useConfirmEmailChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with the updated user on ok:true", async () => {
    const user = { id: "u1", email: "new@example.com" };
    confirmEmailChangeRequestMock.mockResolvedValue({ ok: true, user });

    const { result } = renderHook(() => useConfirmEmailChange(), { wrapper });

    act(() => {
      result.current.mutate("tok-abc");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(confirmEmailChangeRequestMock).toHaveBeenCalledWith("tok-abc");
  });

  it("throws Error on ok:false (unified invalid-link message)", async () => {
    confirmEmailChangeRequestMock.mockResolvedValue({ ok: false, error: "invalid token" });

    const { result } = renderHook(() => useConfirmEmailChange(), { wrapper });

    act(() => {
      result.current.mutate("bad-tok");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
