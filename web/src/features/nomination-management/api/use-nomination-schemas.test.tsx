// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useNominationSchemas } from "./use-nomination-schemas";

const listNominationSchemasRequestMock = vi.fn();
vi.mock("./requests", () => ({
  listNominationSchemasRequest: (...args: unknown[]) => listNominationSchemasRequestMock(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("features/nomination-management/api/useNominationSchemas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("issues a single aggregate request for the whole tournament (спека 0041, FR-8/AC-7)", async () => {
    listNominationSchemasRequestMock.mockResolvedValue({
      ok: true,
      entries: [
        { nominationId: "n1", stages: [{ id: "s1" }], issues: [] },
        { nominationId: "n2", stages: [], issues: [] },
      ],
    });

    const { result } = renderHook(() => useNominationSchemas("t1"), { wrapper });

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(listNominationSchemasRequestMock).toHaveBeenCalledTimes(1);
    expect(listNominationSchemasRequestMock).toHaveBeenCalledWith("t1");
  });

  it("builds the map keyed by nominationId, preserving stages/issues per entry", async () => {
    listNominationSchemasRequestMock.mockResolvedValue({
      ok: true,
      entries: [
        { nominationId: "n1", stages: [{ id: "s1" }], issues: [{ severity: "SCHEMA_ISSUE_SEVERITY_ERROR" }] },
        { nominationId: "n2", stages: [], issues: [] },
      ],
    });

    const { result } = renderHook(() => useNominationSchemas("t1"), { wrapper });

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get("n1")).toEqual({
      stages: [{ id: "s1" }],
      issues: [{ severity: "SCHEMA_ISSUE_SEVERITY_ERROR" }],
      isError: false,
    });
    expect(result.current.get("n2")).toEqual({ stages: [], issues: [], isError: false });
  });

  it("returns an empty map before the request resolves and when the tournament has no nominations", async () => {
    listNominationSchemasRequestMock.mockResolvedValue({ ok: true, entries: [] });

    const { result } = renderHook(() => useNominationSchemas("t1"), { wrapper });

    expect(result.current.size).toBe(0);
    await waitFor(() => expect(listNominationSchemasRequestMock).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });

  it("returns an empty map (no per-nomination isError) when the aggregate request fails", async () => {
    listNominationSchemasRequestMock.mockResolvedValue({ ok: false, error: "Ошибка запроса" });

    const { result } = renderHook(() => useNominationSchemas("t1"), { wrapper });

    await waitFor(() => expect(listNominationSchemasRequestMock).toHaveBeenCalled());
    // Без списка id на клиенте невозможно проставить isError по строкам —
    // карта остаётся пустой, каждая строка получает undefined (см. комментарий
    // в use-nomination-schemas.ts).
    expect(result.current.size).toBe(0);
  });
});
