import { describe, expect, it } from "vitest";
import { bracketRoundOneFilledCount } from "./types";
import type { Bracket, BracketPair, BracketSlot } from "./types";
import type { Pool } from "@/entities/pool/lib/types";

function slot(overrides: Partial<BracketSlot>): BracketSlot {
  return {
    slot: 1,
    state: "BRACKET_SLOT_STATE_EMPTY",
    fighter: { fighterId: "", name: "", club: "" },
    sourceLabel: "",
    ...overrides,
  };
}

function pair(slotA: BracketSlot, slotB: BracketSlot): BracketPair {
  return { index: 1, slotA, slotB, bout: null, resolved: false };
}

function container(): Pool {
  return {
    id: "c1",
    nominationId: "n1",
    nominationName: "",
    number: 1,
    name: "",
    members: [],
    status: "POOL_STATUS_NOT_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
  };
}

function bracket(pairs: BracketPair[], roundNumber = 1): Bracket {
  return {
    stage: {
      id: "s1",
      nominationId: "n1",
      position: 1,
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      status: "POOL_LAYOUT_STATUS_DRAFT",
      bracket: { size: pairs.length * 2, thirdPlace: false },
      groups: null,
      rule: null,
      executionStatus: "STAGE_STATUS_UNSPECIFIED",
    },
    rounds: [
      {
        number: roundNumber,
        title: "",
        thirdPlace: false,
        halves: [{ half: 1, title: "", container: container(), pairs, currentBoutId: "" }],
      },
    ],
    unassigned: [],
    canUndo: false,
    champion: null,
    thirdPlaceWinner: null,
  };
}

// Спека 0032 (join, T12): «Заполнено N / M» страницы этапа (FR-6) для
// сетки — число занятых слотов первого круга, та же логика, что уже
// используется внутри `stageProgressFromSnapshot` (`entities/stage/lib/
// progress.ts`) для правого рельса — вынесена сюда как переиспользуемая
// чистая функция, чтобы не дублировать подсчёт.
describe("entities/bracket/lib/types bracketRoundOneFilledCount", () => {
  it("counts filled slots across round-1 pairs", () => {
    const b = bracket([
      pair(slot({ slot: 1, state: "BRACKET_SLOT_STATE_FILLED" }), slot({ slot: 2, state: "BRACKET_SLOT_STATE_FILLED" })),
      pair(slot({ slot: 3, state: "BRACKET_SLOT_STATE_FILLED" }), slot({ slot: 4, state: "BRACKET_SLOT_STATE_EMPTY" })),
    ]);

    expect(bracketRoundOneFilledCount(b)).toBe(3);
  });

  it("returns 0 for an all-empty bracket", () => {
    const b = bracket([pair(slot({}), slot({}))]);
    expect(bracketRoundOneFilledCount(b)).toBe(0);
  });

  it("ignores slots from rounds other than round 1", () => {
    const b = bracket(
      [pair(slot({ state: "BRACKET_SLOT_STATE_FILLED" }), slot({ state: "BRACKET_SLOT_STATE_FILLED" }))],
      2,
    );
    expect(bracketRoundOneFilledCount(b)).toBe(0);
  });
});
