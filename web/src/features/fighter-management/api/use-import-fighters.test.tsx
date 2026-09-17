// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fighterManagementKeys } from "./keys";
import { useImportFighters } from "./use-import-fighters";

const importFightersRequestMock = vi.fn();
vi.mock("./requests", () => ({
  importFightersRequest: (...args: unknown[]) => importFightersRequestMock(...args),
}));

function csv(): File {
  return new File(["имя;клуб;номинации\n"], "roster.csv", { type: "text/csv" });
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useImportFighters(), { wrapper }), invalidateSpy };
}

describe("features/fighter-management/api/useImportFighters (spec 0049, T11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not touch the roster cache after a preview (dryRun: true) — nothing was written (AC-2)", async () => {
    const report = {
      dryRun: true,
      summary: { rowsRead: 1, created: 1, updated: 0, skipped: 0, rejected: 0 },
      rows: [],
    };
    importFightersRequestMock.mockResolvedValue({ ok: true, report });

    const { result, invalidateSpy } = setup();
    const file = csv();

    act(() => {
      result.current.mutate({ file, dryRun: true, nominationIds: ["n1"] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(importFightersRequestMock).toHaveBeenCalledWith(file, {
      dryRun: true,
      nominationIds: ["n1"],
    });
    expect(result.current.data).toEqual(report);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates the roster keys after a confirmed import (dryRun: false)", async () => {
    importFightersRequestMock.mockResolvedValue({
      ok: true,
      report: {
        dryRun: false,
        summary: { rowsRead: 1, created: 1, updated: 0, skipped: 0, rejected: 0 },
        rows: [],
      },
    });

    const { result, invalidateSpy } = setup();

    act(() => {
      result.current.mutate({ file: csv(), dryRun: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: fighterManagementKeys.all() });
  });

  it("raises the BFF error as a mutation error and invalidates nothing", async () => {
    importFightersRequestMock.mockResolvedValue({ ok: false, error: "неизвестный формат файла" });

    const { result, invalidateSpy } = setup();

    act(() => {
      result.current.mutate({ file: csv(), dryRun: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("неизвестный формат файла");
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
