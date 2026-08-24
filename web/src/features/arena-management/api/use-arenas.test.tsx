// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useArenas } from "./use-arenas";
import { UnauthorizedError } from "@/shared/api/unauthorized";

const listArenasRequestMock = vi.fn();
vi.mock("./requests", () => ({
  listArenasRequest: (...args: unknown[]) => listArenasRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/arena-management/api/useArenas", () => {
  it("resolves with the arena list on ok:true", async () => {
    listArenasRequestMock.mockResolvedValue({ ok: true, arenas: [] });

    const { result } = renderHook(() => useArenas("t1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("throws a generic Error with the server message on a non-401 failure", async () => {
    listArenasRequestMock.mockResolvedValue({ ok: false, error: "Ошибка запроса", status: 500 });

    const { result } = renderHook(() => useArenas("t1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).not.toBeInstanceOf(UnauthorizedError);
    expect(result.current.error?.message).toBe("Ошибка запроса");
  });

  it("throws UnauthorizedError (not a generic Error) on a 401 — spec 0038, FR-18, admin panel included", async () => {
    listArenasRequestMock.mockResolvedValue({
      ok: false,
      error: "authentication required",
      status: 401,
    });

    const { result } = renderHook(() => useArenas("t1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(UnauthorizedError);
  });
});
