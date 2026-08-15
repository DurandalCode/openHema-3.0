// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useStages } from "./use-stages";
import type { Stage } from "@/entities/stage/lib/types";

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const stage: Stage = {
  id: "s1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: null,
  groups: { groupCount: 4 },
  rule: null,
  executionStatus: "STAGE_STATUS_DRAFT",
};

describe("features/stage-management/api/useStages initialData (спека 0032, join)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Страница этапа сеет useStages сервер-загруженным списком (`getStages`,
  // page.tsx) — первый рендер без скелетона, вместо отсутствовавшего до
  // этого initialData фича сразу отдаёт то, что уже было на сервере.
  it("returns seeded initialData immediately, without a loading state", () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stages: [], issues: [] }) });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useStages("n1", { stages: [stage], issues: [] }),
      { wrapper: wrapperFor(qc) },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual({ stages: [stage], issues: [] });
  });

  it("still fetches normally without initialData", () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stages: [], issues: [] }) });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStages("n1"), { wrapper: wrapperFor(qc) });

    expect(result.current.isLoading).toBe(true);
  });
});
