import { describe, expect, it } from "vitest";
import { boutsUntil, myBouts, myNominationProgress, nextBout } from "./my-view";
import type { LiveFeedBoutDto } from "./types";

const ME = "f-me";
const OPPONENT = "f-opp";

function bout(overrides: Partial<LiveFeedBoutDto> = {}): LiveFeedBoutDto {
  return {
    boutId: "b1",
    nominationId: "n1",
    nominationName: "Длинный меч",
    stageTitle: "Группа A",
    poolName: "Пул C",
    arenaId: "a1",
    arenaName: "Арена 1",
    sequenceNumber: 1,
    poolBoutTotal: 5,
    fighterA: { fighterId: ME, name: "Я", club: "Мой клуб" },
    fighterB: { fighterId: OPPONENT, name: "Соперник", club: "Клуб 2" },
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

describe("myBouts", () => {
  it("returns only bouts where the fighter is A or B", () => {
    const mine = bout({ boutId: "b1" });
    const asB = bout({ boutId: "b2", fighterA: { fighterId: "x", name: "X", club: "" }, fighterB: { fighterId: ME, name: "Я", club: "" } });
    const notMine = bout({ boutId: "b3", fighterA: { fighterId: "x", name: "X", club: "" }, fighterB: { fighterId: "y", name: "Y", club: "" } });

    expect(myBouts([mine, asB, notMine], ME)).toEqual([mine, asB]);
  });
});

describe("nextBout", () => {
  it("prefers an in-progress bout over any not-started one", () => {
    const notStarted = bout({ boutId: "b1", sequenceNumber: 1 });
    const inProgress = bout({ boutId: "b2", sequenceNumber: 2, state: "BOUT_STATE_IN_PROGRESS" });

    expect(nextBout([notStarted, inProgress], ME)?.boutId).toBe("b2");
  });

  it("picks the earliest not-started bout by sequenceNumber when nothing is in progress", () => {
    const later = bout({ boutId: "b1", sequenceNumber: 5 });
    const earlier = bout({ boutId: "b2", sequenceNumber: 2 });

    expect(nextBout([later, earlier], ME)?.boutId).toBe("b2");
  });

  it("ignores finished bouts and bouts belonging to other fighters", () => {
    const finished = bout({ boutId: "b1", state: "BOUT_STATE_FINISHED" });
    const someoneElse = bout({
      boutId: "b2",
      fighterA: { fighterId: "x", name: "X", club: "" },
      fighterB: { fighterId: "y", name: "Y", club: "" },
    });

    expect(nextBout([finished, someoneElse], ME)).toBeNull();
  });

  it("returns null when the fighter has no bouts at all", () => {
    expect(nextBout([], ME)).toBeNull();
  });
});

describe("boutsUntil", () => {
  it("counts not-started bouts of the same pool with a lower sequence number", () => {
    const target = bout({ boutId: "target", sequenceNumber: 5 });
    const before1 = bout({ boutId: "before1", sequenceNumber: 3, fighterA: { fighterId: "x", name: "X", club: "" }, fighterB: { fighterId: "y", name: "Y", club: "" } });
    const before2 = bout({ boutId: "before2", sequenceNumber: 4, fighterA: { fighterId: "x", name: "X", club: "" }, fighterB: { fighterId: "y", name: "Y", club: "" } });
    const after = bout({ boutId: "after", sequenceNumber: 6, fighterA: { fighterId: "x", name: "X", club: "" }, fighterB: { fighterId: "y", name: "Y", club: "" } });

    expect(boutsUntil([target, before1, before2, after], target)).toBe(2);
  });

  it("does not count bouts from a different pool or nomination", () => {
    const target = bout({ boutId: "target", sequenceNumber: 5 });
    const otherPool = bout({ boutId: "op", sequenceNumber: 1, poolName: "Пул D" });
    const otherNomination = bout({ boutId: "on", sequenceNumber: 1, nominationId: "n2" });

    expect(boutsUntil([target, otherPool, otherNomination], target)).toBe(0);
  });

  it("does not count finished or in-progress bouts ahead of the target", () => {
    const target = bout({ boutId: "target", sequenceNumber: 5 });
    const finishedBefore = bout({ boutId: "fb", sequenceNumber: 2, state: "BOUT_STATE_FINISHED" });

    expect(boutsUntil([target, finishedBefore], target)).toBe(0);
  });

  it("is 0 for an in-progress target — it is happening now, not queued", () => {
    const inProgress = bout({ boutId: "target", sequenceNumber: 5, state: "BOUT_STATE_IN_PROGRESS" });
    const before = bout({ boutId: "b", sequenceNumber: 1 });

    expect(boutsUntil([inProgress, before], inProgress)).toBe(0);
  });
});

describe("myNominationProgress", () => {
  it("returns null when the fighter has no bouts yet in this nomination (raskladka not ready)", () => {
    expect(myNominationProgress([], ME, "n1")).toBeNull();
  });

  it("counts container-wide done/total, but only my own wins/losses/draws", () => {
    const myWin = bout({ boutId: "b1", state: "BOUT_STATE_FINISHED", scoreA: 15, scoreB: 8 });
    const myLoss = bout({
      boutId: "b2",
      sequenceNumber: 2,
      state: "BOUT_STATE_FINISHED",
      fighterA: { fighterId: OPPONENT, name: "Соперник2", club: "" },
      fighterB: { fighterId: ME, name: "Я", club: "" },
      scoreA: 15,
      scoreB: 3,
    });
    const someoneElsesBout = bout({
      boutId: "b3",
      sequenceNumber: 3,
      state: "BOUT_STATE_FINISHED",
      fighterA: { fighterId: "x", name: "X", club: "" },
      fighterB: { fighterId: "y", name: "Y", club: "" },
    });
    const notStartedInPool = bout({ boutId: "b4", sequenceNumber: 4, fighterA: { fighterId: "x", name: "X", club: "" }, fighterB: { fighterId: "y", name: "Y", club: "" } });

    const result = myNominationProgress([myWin, myLoss, someoneElsesBout, notStartedInPool], ME, "n1");

    expect(result).toEqual({
      containerName: "Пул C",
      done: 3,
      total: 4,
      wins: 1,
      losses: 1,
      draws: 0,
    });
  });

  it("counts a draw correctly", () => {
    const draw = bout({ boutId: "b1", state: "BOUT_STATE_FINISHED", scoreA: 7, scoreB: 7 });

    expect(myNominationProgress([draw], ME, "n1")).toMatchObject({ wins: 0, losses: 0, draws: 1 });
  });

  it("ignores bouts from a different nomination", () => {
    const otherNom = bout({ boutId: "b1", nominationId: "n2" });

    expect(myNominationProgress([otherNom], ME, "n1")).toBeNull();
  });
});
