// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useUpdateNomination } from "./use-update-nomination";
import { nominationManagementKeys } from "./keys";

const updateNominationRequestMock = vi.fn();
vi.mock("./requests", () => ({
  updateNominationRequest: (...args: unknown[]) => updateNominationRequestMock(...args),
}));

describe("features/nomination-management/api/useUpdateNomination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Спека 0031, T5: список номинаций (screen "Номинации") и одиночная
  // номинация (шапка экрана схемы, спека 0031 FR-2) оба читают
  // `UpdateNomination` — успешная правка должна освежить обоих потребителей,
  // а не только список.
  it("invalidates both the tournament's nomination list and the single-nomination key on success", async () => {
    updateNominationRequestMock.mockResolvedValue({
      ok: true,
      nomination: { id: "n1", title: "Updated" },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateNomination("t1"), { wrapper });

    act(() => {
      result.current.mutate({ id: "n1", input: { title: "Updated" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: nominationManagementKeys.list("t1") });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: nominationManagementKeys.one("n1") });
  });

  it("does not invalidate anything on failure", async () => {
    updateNominationRequestMock.mockResolvedValue({ ok: false, error: "bad" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateNomination("t1"), { wrapper });

    act(() => {
      result.current.mutate({ id: "n1", input: { title: "Updated" } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
