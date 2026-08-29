// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useUpdateNotifications } from "./use-update-notifications";

const updateNotificationSettingsRequestMock = vi.fn();
vi.mock("./requests", () => ({
  updateNotificationSettingsRequest: (...args: unknown[]) =>
    updateNotificationSettingsRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useUpdateNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with the updated user on ok:true", async () => {
    const user = { id: "u1", notifications: { applicationState: true, poolSeated: false } };
    updateNotificationSettingsRequestMock.mockResolvedValue({ ok: true, user });

    const { result } = renderHook(() => useUpdateNotifications(), { wrapper });

    act(() => {
      result.current.mutate({ applicationState: true, poolSeated: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateNotificationSettingsRequestMock).toHaveBeenCalledWith({
      applicationState: true,
      poolSeated: false,
    });
  });

  it("throws Error when the address is not verified (409, FR-21)", async () => {
    updateNotificationSettingsRequestMock.mockResolvedValue({
      ok: false,
      error: "email not verified",
    });

    const { result } = renderHook(() => useUpdateNotifications(), { wrapper });

    act(() => {
      result.current.mutate({ applicationState: true, poolSeated: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("email not verified");
  });
});
