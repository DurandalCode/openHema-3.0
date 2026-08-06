import { describe, expect, it } from "vitest";
import type { Bracket, BracketHalf, BracketPair, BracketSlot } from "@/entities/bracket/lib/types";
import type { FighterRef, Pool } from "@/entities/pool/lib/types";
import { clearSlotInBracket, seedFighterInBracket } from "./seed-fighter";

function fighter(id: string): FighterRef {
  return { fighterId: id, name: id, club: "" };
}

function emptySlot(slot: number): BracketSlot {
  return { slot, state: "BRACKET_SLOT_STATE_EMPTY", fighter: fighter(""), sourceLabel: "" };
}

function filledSlot(slot: number, fighterId: string): BracketSlot {
  return { slot, state: "BRACKET_SLOT_STATE_FILLED", fighter: fighter(fighterId), sourceLabel: "" };
}

function container(name: string): Pool {
  return {
    id: "c1",
    nominationId: "n1",
    nominationName: "",
    number: 1,
    name,
    members: [],
    status: "POOL_STATUS_NOT_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
  };
}

function half(halfNum: number, pairs: BracketPair[]): BracketHalf {
  return { half: halfNum, title: `Половина ${halfNum}`, container: container("Круг"), pairs, currentBoutId: "" };
}

function pair(index: number, slotA: BracketSlot, slotB: BracketSlot): BracketPair {
  return { index, slotA, slotB, bout: null, resolved: false };
}

/** bracketFixture — сетка на 4 (два слота в верхней, два в нижней половине). */
function bracketFixture(): Bracket {
  return {
    stage: {
      id: "stage-1",
      nominationId: "n1",
      position: 0,
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      status: "POOL_LAYOUT_STATUS_DRAFT",
      bracket: { size: 4, thirdPlace: false },
      groups: null,
      rule: null,
    },
    rounds: [
      {
        number: 1,
        title: "1/2 финала",
        thirdPlace: false,
        halves: [
          half(1, [pair(1, filledSlot(1, "b1"), emptySlot(2))]),
          half(2, [pair(2, filledSlot(3, "b2"), emptySlot(4))]),
        ],
      },
    ],
    unassigned: [fighter("b3"), fighter("b4")],
    canUndo: false,
    champion: null,
    thirdPlaceWinner: null,
  };
}

function slotByNumber(bracket: Bracket, slot: number): BracketSlot | undefined {
  for (const h of bracket.rounds[0].halves) {
    for (const p of h.pairs) {
      if (p.slotA.slot === slot) return p.slotA;
      if (p.slotB.slot === slot) return p.slotB;
    }
  }
  return undefined;
}

describe("seedFighterInBracket", () => {
  it("moves a fighter from unassigned into an empty slot", () => {
    const initial = bracketFixture();
    const result = seedFighterInBracket(initial, "b3", 2);

    expect(result.unassigned.map((f) => f.fighterId)).toEqual(["b4"]);
    const target = slotByNumber(result, 2);
    expect(target?.state).toBe("BRACKET_SLOT_STATE_FILLED");
    expect(target?.fighter.fighterId).toBe("b3");
  });

  it("moves a fighter already seeded elsewhere into an empty slot", () => {
    const initial = bracketFixture();
    const result = seedFighterInBracket(initial, "b1", 2);

    expect(slotByNumber(result, 1)?.state).toBe("BRACKET_SLOT_STATE_EMPTY");
    expect(slotByNumber(result, 2)?.fighter.fighterId).toBe("b1");
  });

  it("is a no-op when the target slot is already filled (server resolves swap/reject)", () => {
    const initial = bracketFixture();
    const result = seedFighterInBracket(initial, "b3", 3);
    expect(result).toBe(initial);
  });

  it("is a no-op when the fighter is not found", () => {
    const initial = bracketFixture();
    const result = seedFighterInBracket(initial, "missing", 2);
    expect(result).toBe(initial);
  });

  it("does not mutate the source bracket", () => {
    const initial = bracketFixture();
    const snapshot = JSON.stringify(initial);
    seedFighterInBracket(initial, "b3", 2);
    expect(JSON.stringify(initial)).toBe(snapshot);
  });
});

describe("clearSlotInBracket", () => {
  it("empties a filled slot and returns its fighter to unassigned", () => {
    const initial = bracketFixture();
    const result = clearSlotInBracket(initial, 1);

    expect(slotByNumber(result, 1)?.state).toBe("BRACKET_SLOT_STATE_EMPTY");
    expect(result.unassigned.map((f) => f.fighterId)).toEqual(["b3", "b4", "b1"]);
  });

  it("is a no-op on an already-empty slot", () => {
    const initial = bracketFixture();
    const result = clearSlotInBracket(initial, 2);
    expect(result).toBe(initial);
  });
});
