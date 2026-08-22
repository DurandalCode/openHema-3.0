import { describe, expect, it } from "vitest";
import {
  arenasBusy,
  arenasTotal,
  boutsDone,
  boutsTotal,
  tournamentDayNumber,
} from "./counters";
import type { LiveArenaDto, LiveFeedBoutDto } from "./types";

function bout(overrides: Partial<LiveFeedBoutDto>): LiveFeedBoutDto {
  return {
    boutId: "b1",
    nominationId: "n1",
    nominationName: "Длинный меч",
    stageTitle: "Группа A",
    poolName: "Пул A",
    arenaId: "a1",
    arenaName: "Арена 1",
    sequenceNumber: 1,
    poolBoutTotal: 5,
    fighterA: { fighterId: "f1", name: "Иванов", club: "" },
    fighterB: { fighterId: "f2", name: "Петров", club: "" },
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function arena(overrides: Partial<LiveArenaDto>): LiveArenaDto {
  return {
    arenaId: "a1",
    arenaName: "Арена 1",
    position: 0,
    state: "free",
    nominationId: "",
    nominationName: "",
    poolName: "",
    stageTitle: "",
    currentBout: null,
    poolBoutTotal: 0,
    poolBoutFinished: 0,
    ...overrides,
  };
}

describe("entities/tournament-live/lib/counters bouts", () => {
  it("counts finished bouts out of total (FR-13)", () => {
    const bouts = [
      bout({ boutId: "a", state: "BOUT_STATE_FINISHED" }),
      bout({ boutId: "b", state: "BOUT_STATE_IN_PROGRESS" }),
      bout({ boutId: "c", state: "BOUT_STATE_NOT_STARTED" }),
    ];
    expect(boutsDone(bouts)).toBe(1);
    expect(boutsTotal(bouts)).toBe(3);
  });

  it("returns 0/0 for an empty list", () => {
    expect(boutsDone([])).toBe(0);
    expect(boutsTotal([])).toBe(0);
  });
});

describe("entities/tournament-live/lib/counters arenas", () => {
  it("counts non-free arenas as busy out of total (FR-13)", () => {
    const arenas = [
      arena({ arenaId: "a", state: "bout_in_progress" }),
      arena({ arenaId: "b", state: "preparing" }),
      arena({ arenaId: "c", state: "free" }),
    ];
    expect(arenasBusy(arenas)).toBe(2);
    expect(arenasTotal(arenas)).toBe(3);
  });
});

describe("entities/tournament-live/lib/counters tournamentDayNumber", () => {
  it("returns null when startAt is not set", () => {
    expect(tournamentDayNumber(null, new Date("2026-08-22T12:00:00Z"))).toBeNull();
  });

  it("returns 1 on the start day itself", () => {
    expect(
      tournamentDayNumber("2026-08-22T09:00:00Z", new Date("2026-08-22T15:00:00Z")),
    ).toBe(1);
  });

  it("returns 2 on the calendar day after start (FR-12 'день 2')", () => {
    expect(
      tournamentDayNumber("2026-08-22T09:00:00Z", new Date("2026-08-23T10:00:00Z")),
    ).toBe(2);
  });

  it("returns 1 when now is before the start date but same calendar day", () => {
    expect(
      tournamentDayNumber("2026-08-22T18:00:00Z", new Date("2026-08-22T08:00:00Z")),
    ).toBe(1);
  });

  it("clamps to 1 when now's calendar day precedes the start's calendar day", () => {
    // Погранслучай: турнир формально ещё не наступил по календарю (now на
    // день раньше startAt), но снапшот уже пришёл в фазе "running"/"finished"
    // (иначе tournamentDayNumber не вызывается вовсе). День не может быть
    // меньше 1 — клэмпим, а не уходим в 0/отрицательные значения.
    expect(
      tournamentDayNumber("2026-08-23T09:00:00Z", new Date("2026-08-22T20:00:00Z")),
    ).toBe(1);
  });
});
