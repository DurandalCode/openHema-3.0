// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useUpdateProfile } from "./use-update-profile";

const updateProfileRequestMock = vi.fn();
vi.mock("./requests", () => ({
  updateProfileRequest: (...args: unknown[]) => updateProfileRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/profile/api/useUpdateProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with the updated user on ok:true", async () => {
    const user = {
      id: "u1",
      email: "ivan@example.com",
      displayName: "Иван Кравцов",
      role: "ROLE_USER",
      createdAt: "2026-01-14T00:00:00.000Z",
      club: "Северный клинок",
    };
    updateProfileRequestMock.mockResolvedValue({ ok: true, user });

    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    act(() => {
      result.current.mutate({ displayName: "Иван Кравцов", club: "Северный клинок" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(user);
  });

  it("throws Error with server message on ok:false", async () => {
    updateProfileRequestMock.mockResolvedValue({
      ok: false,
      error: "display name is required",
    });

    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    act(() => {
      result.current.mutate({ displayName: "", club: "" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("display name is required");
  });
});
