import { describe, expect, it } from "vitest";
import { groupBoutsByPool, type Bout } from "./types";

function makeBout(overrides: Partial<Bout>): Bout {
  return {
    id: "bout-id",
    poolId: "pool-1",
    nominationId: "nom-1",
    roundNumber: 1,
    sequenceNumber: 1,
    fighterA: { fighterId: "f-a", name: "Боец A", club: "" },
    fighterB: { fighterId: "f-b", name: "Боец B", club: "" },
    ...overrides,
  };
}

describe("entities/bout/lib/groupBoutsByPool", () => {
  it("returns empty object for empty input", () => {
    expect(groupBoutsByPool([])).toEqual({});
  });

  it("groups bouts by poolId", () => {
    const bouts = [
      makeBout({ id: "b1", poolId: "p1", sequenceNumber: 1 }),
      makeBout({ id: "b2", poolId: "p2", sequenceNumber: 1 }),
      makeBout({ id: "b3", poolId: "p1", sequenceNumber: 2 }),
    ];

    const grouped = groupBoutsByPool(bouts);

    expect(Object.keys(grouped).sort()).toEqual(["p1", "p2"]);
    expect(grouped.p1?.map((b) => b.id)).toEqual(["b1", "b3"]);
    expect(grouped.p2?.map((b) => b.id)).toEqual(["b2"]);
  });

  it("sorts each pool's bouts by sequenceNumber regardless of input order", () => {
    const bouts = [
      makeBout({ id: "b3", poolId: "p1", sequenceNumber: 3 }),
      makeBout({ id: "b1", poolId: "p1", sequenceNumber: 1 }),
      makeBout({ id: "b2", poolId: "p1", sequenceNumber: 2 }),
    ];

    const grouped = groupBoutsByPool(bouts);

    expect(grouped.p1?.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("does not mutate input array order", () => {
    const bouts = [
      makeBout({ id: "b2", poolId: "p1", sequenceNumber: 2 }),
      makeBout({ id: "b1", poolId: "p1", sequenceNumber: 1 }),
    ];
    const originalOrder = bouts.map((b) => b.id);

    groupBoutsByPool(bouts);

    expect(bouts.map((b) => b.id)).toEqual(originalOrder);
  });
});
