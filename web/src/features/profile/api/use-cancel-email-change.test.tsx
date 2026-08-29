// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useCancelEmailChange } from "./use-cancel-email-change";

const cancelEmailChangeRequestMock = vi.fn();
vi.mock("./requests", () => ({
  cancelEmailChangeRequest: (...args: unknown[]) => cancelEmailChangeRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useCancelEmailChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with the updated user (no pendingEmail) on ok:true", async () => {
    const user = { id: "u1", pendingEmail: "" };
    cancelEmailChangeRequestMock.mockResolvedValue({ ok: true, user });

    const { result } = renderHook(() => useCancelEmailChange(), { wrapper });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(user);
  });
});
