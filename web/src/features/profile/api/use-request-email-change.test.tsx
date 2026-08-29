// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useRequestEmailChange } from "./use-request-email-change";

const requestEmailChangeRequestMock = vi.fn();
vi.mock("./requests", () => ({
  requestEmailChangeRequest: (...args: unknown[]) => requestEmailChangeRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useRequestEmailChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with the updated user on ok:true", async () => {
    const user = { id: "u1", pendingEmail: "new@example.com" };
    requestEmailChangeRequestMock.mockResolvedValue({ ok: true, user });

    const { result } = renderHook(() => useRequestEmailChange(), { wrapper });

    act(() => {
      result.current.mutate({ newEmail: "new@example.com", currentPassword: "pw" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestEmailChangeRequestMock).toHaveBeenCalledWith("new@example.com", "pw");
    expect(result.current.data).toEqual(user);
  });

  it("throws Error with the server message on ok:false (e.g. taken address)", async () => {
    requestEmailChangeRequestMock.mockResolvedValue({ ok: false, error: "email taken" });

    const { result } = renderHook(() => useRequestEmailChange(), { wrapper });

    act(() => {
      result.current.mutate({ newEmail: "taken@example.com", currentPassword: "pw" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("email taken");
  });
});
