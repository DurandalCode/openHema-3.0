import { describe, expect, it } from "vitest";
import { scoreboardPhase } from "./scoreboard-phase";
import type { BoutBoard, BoardBout, Pool, FighterRef } from "@/entities/pool/lib/types";

const pool: Pool = {
  id: "pool-1",
  nominationId: "n1",
  nominationName: "Длинный меч",
  number: 1,
  name: "Пул A",
  members: [],
  status: "POOL_STATUS_ACTIVE",
  arenaId: "arena-1",
  arenaName: "Ристалище 1",
  standings: [],
};

function fighter(id: string, name: string): FighterRef {
  return { fighterId: id, name, club: "" };
}

function bout(partial: Partial<BoardBout> & { id: string; sequenceNumber: number }): BoardBout {
  return {
    id: partial.id,
    roundNumber: 1,
    sequenceNumber: partial.sequenceNumber,
    fighterA: partial.fighterA ?? fighter(`${partial.id}-a`, `${partial.id} A`),
    fighterB: partial.fighterB ?? fighter(`${partial.id}-b`, `${partial.id} B`),
    state: partial.state ?? "BOUT_STATE_NOT_STARTED",
    scoreA: partial.scoreA ?? 0,
    scoreB: partial.scoreB ?? 0,
  };
}

describe("entities/arena-live/lib/scoreboard-phase scoreboardPhase", () => {
  it("returns idle when there is no board", () => {
    expect(
      scoreboardPhase({
        board: null,
        displayedBoutId: null,
        timerStatus: "TIMER_STATUS_STOPPED",
        remainingCs: 3000,
      }),
    ).toBe("idle");
  });

  it("returns idle when the board has no pool", () => {
    const board: BoutBoard = { pool: null, bouts: [], currentBoutId: "" };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: null,
        timerStatus: "TIMER_STATUS_STOPPED",
        remainingCs: 3000,
      }),
    ).toBe("idle");
  });

  it("returns idle when displayedBoutId is null", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1 })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: null,
        timerStatus: "TIMER_STATUS_STOPPED",
        remainingCs: 3000,
      }),
    ).toBe("idle");
  });

  it("returns idle when displayedBoutId does not match any bout on the board", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1 })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "not-on-board",
        timerStatus: "TIMER_STATUS_STOPPED",
        remainingCs: 3000,
      }),
    ).toBe("idle");
  });

  it("returns waiting when the displayed bout has not started (AC-16)", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_NOT_STARTED" })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "b1",
        timerStatus: "TIMER_STATUS_STOPPED",
        remainingCs: 18_000,
      }),
    ).toBe("waiting");
  });

  it("returns running while the bout is in progress with time left", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "b1",
        timerStatus: "TIMER_STATUS_RUNNING",
        remainingCs: 18_000,
      }),
    ).toBe("running");
  });

  it("returns running while the timer is merely paused (still in progress)", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "b1",
        timerStatus: "TIMER_STATUS_PAUSED",
        remainingCs: 18_000,
      }),
    ).toBe("running");
  });

  it("returns endgame at exactly 499cs, remaining below the 500cs threshold (AC-15)", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "b1",
        timerStatus: "TIMER_STATUS_RUNNING",
        remainingCs: 499,
      }),
    ).toBe("endgame");
  });

  it("does not treat exactly 500cs as endgame — the boundary is strict < (AC-15)", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "b1",
        timerStatus: "TIMER_STATUS_RUNNING",
        remainingCs: 500,
      }),
    ).toBe("running");
  });

  it("returns expired once the timer hits EXPIRED, distinct from endgame (AC-15)", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "b1",
        timerStatus: "TIMER_STATUS_EXPIRED",
        remainingCs: 0,
      }),
    ).toBe("expired");
  });

  it("returns announced for a finished displayed bout regardless of timer status", () => {
    const board: BoutBoard = {
      pool,
      bouts: [bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_FINISHED", scoreA: 5, scoreB: 2 })],
      currentBoutId: "b1",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "b1",
        timerStatus: "TIMER_STATUS_STOPPED",
        remainingCs: 18_000,
      }),
    ).toBe("announced");
  });

  it("keeps announced even though the server already advanced currentBoutId (AC-17)", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_FINISHED", scoreA: 5, scoreB: 2 }),
        bout({ id: "b2", sequenceNumber: 2, state: "BOUT_STATE_NOT_STARTED" }),
      ],
      // сервер уже продвинул текущий бой на b2 — табло всё ещё показывает b1
      currentBoutId: "b2",
    };
    expect(
      scoreboardPhase({
        board,
        displayedBoutId: "b1",
        timerStatus: "TIMER_STATUS_STOPPED",
        remainingCs: 18_000,
      }),
    ).toBe("announced");
  });
});
