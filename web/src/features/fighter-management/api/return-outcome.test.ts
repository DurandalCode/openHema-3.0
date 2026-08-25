import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolLayout } from "@/entities/pool/lib/types";
import type { Stage } from "@/entities/stage/lib/types";

vi.mock("@/shared/api/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/shared/api/api-fetch";
import { resolveReturnSeeding } from "./return-outcome";

function stage(overrides: Partial<Stage>): Stage {
  return {
    id: "s1",
    nominationId: "n1",
    position: 0,
    title: "Группа",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_DRAFT",
    bracket: null,
    groups: null,
    rule: null,
    executionStatus: "STAGE_STATUS_DRAFT",
    ...overrides,
  };
}

function layout(overrides: Partial<PoolLayout>): PoolLayout {
  return {
    nominationId: "n1",
    status: "POOL_LAYOUT_STATUS_DRAFT",
    unassigned: [],
    pools: [],
    canUndo: false,
    stage: stage({}),
    ...overrides,
  };
}

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveReturnSeeding", () => {
  it("returns null when the nomination has no group stage (nothing to restore)", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, data: { stages: [stage({ type: "STAGE_TYPE_BRACKET" })] } });

    const outcome = await resolveReturnSeeding("f1", ["n1"]);

    expect(outcome).toBeNull();
  });

  it("returns restored: true with the pool number when the fighter is seated in a pool (FR-6, AC-4)", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, data: { stages: [stage({ id: "s1" })] } })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          layout: layout({
            pools: [
              {
                id: "p1",
                nominationId: "n1",
                nominationName: "Лонгсворд",
                number: 2,
                name: "Пул 2",
                members: [{ fighterId: "f1", name: "Иван", club: "" }],
                status: "POOL_STATUS_NOT_READY",
                arenaId: "",
                arenaName: "",
                standings: [],
              },
            ],
            unassigned: [],
          }),
        },
      });

    const outcome = await resolveReturnSeeding("f1", ["n1"]);

    expect(outcome).toEqual({ restored: true, poolNumber: 2 });
  });

  it("returns restored: false when the fighter ends up unassigned (FR-6, AC-5)", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, data: { stages: [stage({ id: "s1" })] } })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          layout: layout({ unassigned: [{ fighterId: "f1", name: "Иван", club: "" }] }),
        },
      });

    const outcome = await resolveReturnSeeding("f1", ["n1"]);

    expect(outcome).toEqual({ restored: false });
  });

  it("returns null when the fighter is not found in any layout at all", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, data: { stages: [stage({ id: "s1" })] } })
      .mockResolvedValueOnce({ ok: true, data: { layout: layout({}) } });

    const outcome = await resolveReturnSeeding("f1", ["n1"]);

    expect(outcome).toBeNull();
  });

  it("dedupes nomination ids and checks group stages across all of them", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, data: { stages: [] } });

    await resolveReturnSeeding("f1", ["n1", "n1", "n2"]);

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch).toHaveBeenCalledWith("/api/nominations/n1/stages");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/nominations/n2/stages");
  });

  it("returns null when a request fails (best-effort, no crash)", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, error: "boom" });

    const outcome = await resolveReturnSeeding("f1", ["n1"]);

    expect(outcome).toBeNull();
  });
});
