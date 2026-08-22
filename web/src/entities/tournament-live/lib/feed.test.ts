import { describe, expect, it } from "vitest";
import { boutOutcomeLabel, boutTimeLabel, filterFeed, sortFeed } from "./feed";
import type { LiveFeedBoutDto } from "./types";

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
    fighterA: { fighterId: "f1", name: "Иванов", club: "Клуб 1" },
    fighterB: { fighterId: "f2", name: "Петров", club: "Клуб 2" },
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

describe("entities/tournament-live/lib/feed sortFeed", () => {
  it("orders in-progress first, then not-started by sequence, then finished newest-first (FR-17)", () => {
    const inProgress = bout({ boutId: "in-progress", state: "BOUT_STATE_IN_PROGRESS" });
    const notStarted2 = bout({ boutId: "not-started-2", state: "BOUT_STATE_NOT_STARTED", sequenceNumber: 2 });
    const notStarted1 = bout({ boutId: "not-started-1", state: "BOUT_STATE_NOT_STARTED", sequenceNumber: 1 });
    const finishedOld = bout({
      boutId: "finished-old",
      state: "BOUT_STATE_FINISHED",
      finishedAt: "2026-08-22T10:00:00Z",
    });
    const finishedNew = bout({
      boutId: "finished-new",
      state: "BOUT_STATE_FINISHED",
      finishedAt: "2026-08-22T11:00:00Z",
    });

    const input = [finishedOld, notStarted2, finishedNew, inProgress, notStarted1];
    const sorted = sortFeed(input);

    expect(sorted.map((b) => b.boutId)).toEqual([
      "in-progress",
      "not-started-1",
      "not-started-2",
      "finished-new",
      "finished-old",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      bout({ boutId: "a", state: "BOUT_STATE_FINISHED", finishedAt: "2026-08-22T10:00:00Z" }),
      bout({ boutId: "b", state: "BOUT_STATE_IN_PROGRESS" }),
    ];
    const snapshot = [...input];
    sortFeed(input);
    expect(input).toEqual(snapshot);
  });
});

describe("entities/tournament-live/lib/feed filterFeed", () => {
  const bouts = [
    bout({ boutId: "a", nominationId: "n1" }),
    bout({ boutId: "b", nominationId: "n2" }),
  ];

  it("returns all bouts when nominationId is null", () => {
    expect(filterFeed(bouts, null)).toHaveLength(2);
  });

  it("returns all bouts when nominationId is empty string", () => {
    expect(filterFeed(bouts, "")).toHaveLength(2);
  });

  it("returns only bouts of the given nomination", () => {
    const result = filterFeed(bouts, "n1");
    expect(result.map((b) => b.boutId)).toEqual(["a"]);
  });
});

describe("entities/tournament-live/lib/feed boutTimeLabel", () => {
  it("shows startedAt (time only) for an in-progress bout (AC-11)", () => {
    const b = bout({ state: "BOUT_STATE_IN_PROGRESS", startedAt: "2026-08-22T11:02:00Z" });
    const label = boutTimeLabel(b);
    expect(label).not.toBe("—");
    expect(label).not.toBe("");
  });

  it("shows finishedAt for a finished bout (AC-12)", () => {
    const b = bout({
      state: "BOUT_STATE_FINISHED",
      startedAt: "2026-08-22T10:40:00Z",
      finishedAt: "2026-08-22T10:44:00Z",
    });
    expect(boutTimeLabel(b)).not.toBe("—");
  });

  it("shows a dash for a not-started bout, no forecast (AC-13)", () => {
    const b = bout({ state: "BOUT_STATE_NOT_STARTED" });
    expect(boutTimeLabel(b)).toBe("—");
  });

  it("shows startedAt, not the stale finishedAt, when a finished bout is reopened (AC-14)", () => {
    const reopened = bout({
      state: "BOUT_STATE_IN_PROGRESS",
      startedAt: "2026-08-22T11:02:00Z",
      finishedAt: "2026-08-22T10:44:00Z",
    });
    const label = boutTimeLabel(reopened);
    const startedLabel = boutTimeLabel(
      bout({ state: "BOUT_STATE_IN_PROGRESS", startedAt: "2026-08-22T11:02:00Z", finishedAt: null }),
    );
    expect(label).toBe(startedLabel);
  });
});

describe("entities/tournament-live/lib/feed boutOutcomeLabel", () => {
  it("returns null for a not-started bout", () => {
    expect(boutOutcomeLabel(bout({ state: "BOUT_STATE_NOT_STARTED" }))).toBeNull();
  });

  it("returns null for an in-progress bout", () => {
    expect(boutOutcomeLabel(bout({ state: "BOUT_STATE_IN_PROGRESS" }))).toBeNull();
  });

  it("returns the winner's name for a finished bout", () => {
    const b = bout({
      state: "BOUT_STATE_FINISHED",
      scoreA: 4,
      scoreB: 2,
      fighterA: { fighterId: "f1", name: "Иванов", club: "" },
      fighterB: { fighterId: "f2", name: "Петров", club: "" },
    });
    expect(boutOutcomeLabel(b)).toContain("Иванов");
  });

  it("returns a draw label when scores are equal", () => {
    const b = bout({ state: "BOUT_STATE_FINISHED", scoreA: 3, scoreB: 3 });
    expect(boutOutcomeLabel(b)).toMatch(/ничья/i);
  });
});
