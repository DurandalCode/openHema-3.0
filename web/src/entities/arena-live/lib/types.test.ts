import { describe, expect, it } from "vitest";
import { nextBout, boutNumber } from "./types";
import type { BoutBoard, BoardBout, Pool } from "@/entities/pool/lib/types";

const pool: Pool = {
  id: "pool-1",
  nominationId: "n1",
  nominationName: "Longsword",
  number: 1,
  name: "Пул 1",
  members: [],
  status: "POOL_STATUS_ACTIVE",
  arenaId: "arena-1",
  arenaName: "Ристалище 1",
};

function bout(partial: Partial<BoardBout> & { id: string; sequenceNumber: number }): BoardBout {
  return {
    id: partial.id,
    roundNumber: 1,
    sequenceNumber: partial.sequenceNumber,
    fighterA: { fighterId: `${partial.id}-a`, name: `${partial.id} A`, club: "" },
    fighterB: { fighterId: `${partial.id}-b`, name: `${partial.id} B`, club: "" },
    state: partial.state ?? "BOUT_STATE_NOT_STARTED",
    scoreA: partial.scoreA ?? 0,
    scoreB: partial.scoreB ?? 0,
  };
}

describe("nextBout", () => {
  it("returns null when board is null", () => {
    expect(nextBout(null)).toBeNull();
  });

  it("returns null when there is no pool on the board", () => {
    expect(nextBout({ pool: null, bouts: [], currentBoutId: "" })).toBeNull();
  });

  it("returns the next unfinished bout after the current one, by sequence order", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_FINISHED" }),
        bout({ id: "b2", sequenceNumber: 2, state: "BOUT_STATE_IN_PROGRESS" }),
        bout({ id: "b3", sequenceNumber: 3, state: "BOUT_STATE_NOT_STARTED" }),
      ],
      currentBoutId: "b2",
    };
    expect(nextBout(board)?.id).toBe("b3");
  });

  it("returns null when the current bout is the last unfinished one", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_FINISHED" }),
        bout({ id: "b2", sequenceNumber: 2, state: "BOUT_STATE_IN_PROGRESS" }),
      ],
      currentBoutId: "b2",
    };
    expect(nextBout(board)).toBeNull();
  });

  it("skips already-finished bouts to find the next unplayed one", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" }),
        bout({ id: "b2", sequenceNumber: 2, state: "BOUT_STATE_FINISHED" }),
        bout({ id: "b3", sequenceNumber: 3, state: "BOUT_STATE_NOT_STARTED" }),
      ],
      currentBoutId: "b1",
    };
    expect(nextBout(board)?.id).toBe("b3");
  });

  it("returns null when the current bout id doesn't match any bout", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1 })],
      currentBoutId: "unknown",
    };
    expect(nextBout(board)).toBeNull();
  });
});

describe("boutNumber", () => {
  it("returns null when board is null", () => {
    expect(boutNumber(null)).toBeNull();
  });

  it("returns the 1-indexed position of the current bout and the total count", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1 }),
        bout({ id: "b2", sequenceNumber: 2 }),
        bout({ id: "b3", sequenceNumber: 3 }),
      ],
      currentBoutId: "b2",
    };
    expect(boutNumber(board)).toEqual({ current: 2, total: 3 });
  });

  it("returns null when there is no current bout match", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1 })],
      currentBoutId: "",
    };
    expect(boutNumber(board)).toBeNull();
  });
});
