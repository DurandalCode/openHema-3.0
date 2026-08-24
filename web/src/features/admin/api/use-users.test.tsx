// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useUsers } from "./use-users";
import { UnauthorizedError } from "@/shared/api/unauthorized";

const listUsersRequestMock = vi.fn();
vi.mock("./requests", () => ({
  listUsersRequest: (...args: unknown[]) => listUsersRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/admin/api/useUsers", () => {
  it("resolves with the users list on ok:true", async () => {
    listUsersRequestMock.mockResolvedValue({ ok: true, users: [] });

    const { result } = renderHook(() => useUsers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("throws a generic Error with the server message on a non-401 failure", async () => {
    listUsersRequestMock.mockResolvedValue({ ok: false, error: "Ошибка запроса", status: 500 });

    const { result } = renderHook(() => useUsers(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).not.toBeInstanceOf(UnauthorizedError);
    expect(result.current.error?.message).toBe("Ошибка запроса");
  });

  it("throws UnauthorizedError (not a generic Error) on a 401 — spec 0038, FR-18, admin panel included", async () => {
    listUsersRequestMock.mockResolvedValue({
      ok: false,
      error: "authentication required",
      status: 401,
    });

    const { result } = renderHook(() => useUsers(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(UnauthorizedError);
  });
});
