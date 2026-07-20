import { describe, expect, it } from "vitest";
import type { FighterRef, Pool, PoolLayout } from "@/entities/pool/lib/types";
import { moveFighterInLayout } from "./move-fighter";

function fighter(id: string, club = ""): FighterRef {
  return { fighterId: id, name: id, club };
}
function pool(id: string, members: FighterRef[]): Pool {
  return {
    id,
    nominationId: "n1",
    nominationName: "",
    number: 1,
    name: "Пул 1",
    members,
    status: "POOL_STATUS_NOT_READY",
    arenaId: "",
    arenaName: "",
  };
}
function layout(pools: Pool[], unassigned: FighterRef[] = [], canUndo = false): PoolLayout {
  return { nominationId: "n1", status: "POOL_LAYOUT_STATUS_DRAFT", unassigned, pools, canUndo };
}

describe("moveFighterInLayout", () => {
  it("moves fighter from unassigned to pool", () => {
    const p1 = pool("p1", []);
    const initial = layout([p1], [fighter("b1"), fighter("b2")]);
    const result = moveFighterInLayout(initial, "b1", "p1");
    expect(result.unassigned.map((f) => f.fighterId)).toEqual(["b2"]);
    expect(result.pools[0].members.map((f) => f.fighterId)).toEqual(["b1"]);
  });

  it("moves fighter from pool to unassigned", () => {
    const p1 = pool("p1", [fighter("b1"), fighter("b2")]);
    const initial = layout([p1]);
    const result = moveFighterInLayout(initial, "b1", null);
    expect(result.pools[0].members.map((f) => f.fighterId)).toEqual(["b2"]);
    expect(result.unassigned.map((f) => f.fighterId)).toEqual(["b1"]);
  });

  it("moves fighter between pools (no duplicate)", () => {
    const p1 = pool("p1", [fighter("b1")]);
    const p2 = pool("p2", [fighter("b2")]);
    const initial = layout([p1, p2]);
    const result = moveFighterInLayout(initial, "b1", "p2");
    expect(result.pools[0].members.map((f) => f.fighterId)).toEqual([]);
    expect(result.pools[1].members.map((f) => f.fighterId)).toEqual(["b2", "b1"]);
  });

  it("is no-op when fighter not found", () => {
    const initial = layout([pool("p1", [fighter("b1")])], [fighter("b2")]);
    const result = moveFighterInLayout(initial, "missing", "p1");
    expect(result).toBe(initial);
  });

  it("is no-op when target pool not found", () => {
    const initial = layout([pool("p1", [])], [fighter("b1")]);
    const result = moveFighterInLayout(initial, "b1", "missing");
    expect(result).toBe(initial);
  });

  it("does not mutate source layout", () => {
    const p1 = pool("p1", [fighter("b1")]);
    const initial = layout([p1], [fighter("b2")]);
    const snapshot = JSON.stringify(initial);
    moveFighterInLayout(initial, "b2", "p1");
    expect(JSON.stringify(initial)).toBe(snapshot);
  });
});