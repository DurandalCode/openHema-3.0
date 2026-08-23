// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useSubmitApplication } from "./use-submit-application";
import { ApplicationRequestError } from "./mutation-error";
import { UnauthorizedError } from "@/shared/api/unauthorized";

const submitApplicationRequestMock = vi.fn();
vi.mock("./requests", () => ({
  submitApplicationRequest: (...args: unknown[]) => submitApplicationRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/my-applications/api/useSubmitApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws an ApplicationRequestError carrying the HTTP status on failure (spec 0036, FR-6)", async () => {
    submitApplicationRequestMock.mockResolvedValue({
      ok: false,
      error: "Приём заявок в эту номинацию завершён",
      status: 409,
    });

    const { result } = renderHook(() => useSubmitApplication(), { wrapper });

    act(() => {
      result.current.mutate({ nominationId: "n1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApplicationRequestError);
    expect((result.current.error as ApplicationRequestError).status).toBe(409);
    expect(result.current.error?.message).toBe("Приём заявок в эту номинацию завершён");
  });

  it("throws UnauthorizedError (not ApplicationRequestError) on a 401 — spec 0038, FR-18/AC-10", async () => {
    submitApplicationRequestMock.mockResolvedValue({
      ok: false,
      error: "unauthenticated",
      status: 401,
    });

    const { result } = renderHook(() => useSubmitApplication(), { wrapper });

    act(() => {
      result.current.mutate({ nominationId: "n1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(UnauthorizedError);
  });
});
