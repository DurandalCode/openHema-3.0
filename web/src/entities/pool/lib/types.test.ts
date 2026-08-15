import { describe, expect, it } from "vitest";
import { outcomeOf, poolLayoutCounts } from "./types";
import type { FighterRef, Pool, PoolLayout } from "./types";

function fighter(id: string): FighterRef {
  return { fighterId: id, name: `Боец ${id}`, club: "" };
}

function pool(id: string, memberIds: string[]): Pool {
  return {
    id,
    nominationId: "n1",
    nominationName: "Номинация",
    number: 1,
    name: `Пул ${id}`,
    members: memberIds.map(fighter),
    status: "POOL_STATUS_NOT_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
  };
}

function layoutStub(unassignedIds: string[], pools: Pool[]): PoolLayout {
  return {
    nominationId: "n1",
    status: "POOL_LAYOUT_STATUS_DRAFT",
    unassigned: unassignedIds.map(fighter),
    pools,
    canUndo: false,
    stage: {
      id: "stage-1",
      nominationId: "n1",
      position: 0,
      title: "Групповой этап",
      type: "STAGE_TYPE_GROUPS",
      status: "POOL_LAYOUT_STATUS_DRAFT",
      bracket: null,
      groups: null,
      rule: null,
    },
  };
}

describe("entities/pool/lib/types poolLayoutCounts", () => {
  it("returns all zeros for an empty layout (spec AC-1)", () => {
    expect(poolLayoutCounts(layoutStub([], []))).toEqual({
      assigned: 0,
      total: 0,
      poolCount: 0,
    });
  });

  it("counts a partially distributed layout", () => {
    const layout = layoutStub(
      ["u1", "u2"],
      [pool("p1", ["a1", "a2"]), pool("p2", ["a3"]), pool("p3", []), pool("p4", [])],
    );
    expect(poolLayoutCounts(layout)).toEqual({ assigned: 3, total: 5, poolCount: 4 });
  });

  it("counts a fully distributed layout with no unassigned left", () => {
    const layout = layoutStub([], [pool("p1", ["a1", "a2"]), pool("p2", ["a3"])]);
    expect(poolLayoutCounts(layout)).toEqual({ assigned: 3, total: 3, poolCount: 2 });
  });
});

describe("entities/pool/lib/types outcomeOf", () => {
  it("returns 'A' when fighter A has more points (AC-2)", () => {
    expect(outcomeOf(5, 3)).toBe("A");
  });

  it("returns 'B' when fighter B has more points", () => {
    expect(outcomeOf(3, 5)).toBe("B");
  });

  it("returns 'draw' when scores are equal (AC-3)", () => {
    expect(outcomeOf(4, 4)).toBe("draw");
  });

  it("returns 'draw' for 0:0 (not started bout)", () => {
    expect(outcomeOf(0, 0)).toBe("draw");
  });
});
