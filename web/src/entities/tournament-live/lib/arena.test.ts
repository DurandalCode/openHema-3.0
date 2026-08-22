import { describe, expect, it } from "vitest";
import { arenaStateLabel, arenaSubtitle } from "./arena";
import type { LiveArenaDto, LiveFeedBoutDto } from "./types";

function currentBout(overrides: Partial<LiveFeedBoutDto> = {}): LiveFeedBoutDto {
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
    fighterA: { fighterId: "f1", name: "Иванов", club: "Клуб 1" },
    fighterB: { fighterId: "f2", name: "Петров", club: "Клуб 2" },
    state: "BOUT_STATE_IN_PROGRESS",
    scoreA: 4,
    scoreB: 2,
    startedAt: "2026-08-22T11:02:00Z",
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

describe("entities/tournament-live/lib/arena arenaStateLabel", () => {
  it("labels bout_in_progress", () => {
    expect(arenaStateLabel("bout_in_progress")).toMatch(/идёт/i);
  });

  it("labels preparing", () => {
    expect(arenaStateLabel("preparing")).toMatch(/готов/i);
  });

  it("labels free", () => {
    expect(arenaStateLabel("free")).toMatch(/свободн/i);
  });
});

describe("entities/tournament-live/lib/arena arenaSubtitle", () => {
  it("shows nomination/stage/pool for bout_in_progress (AC-7)", () => {
    const a = arena({
      state: "bout_in_progress",
      nominationName: "Длинный меч",
      stageTitle: "Группа A",
      poolName: "Пул A",
      currentBout: currentBout(),
    });
    const subtitle = arenaSubtitle(a);
    expect(subtitle).toContain("Длинный меч");
    expect(subtitle).toContain("Группа A");
    expect(subtitle).toContain("Пул A");
  });

  it("shows nomination/stage/pool for preparing (AC-8)", () => {
    const a = arena({
      state: "preparing",
      nominationName: "Длинный меч",
      stageTitle: "Группа A",
      poolName: "Пул A",
      currentBout: currentBout({ state: "BOUT_STATE_NOT_STARTED", startedAt: null }),
    });
    const subtitle = arenaSubtitle(a);
    expect(subtitle).toContain("Длинный меч");
    expect(subtitle).toContain("Пул A");
  });

  it("is empty for a free arena (AC-9)", () => {
    const a = arena({ state: "free" });
    expect(arenaSubtitle(a)).toBe("");
  });
});
