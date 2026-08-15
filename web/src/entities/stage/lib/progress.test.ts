import { describe, expect, it } from "vitest";
import { stageProgressFromSnapshot } from "./progress";
import type { NominationLiveSnapshotDto, LivePoolDto } from "@/entities/nomination-live/lib/types";
import type { Pool, BoardBout, FighterRef } from "@/entities/pool/lib/types";
import type { Bracket, BracketRound, BracketPair, BracketSlot } from "@/entities/bracket/lib/types";
import type { Stage } from "@/entities/stage/lib/types";
import { emptyNominationResults } from "@/entities/nomination-results/lib/types";

function fighter(id: string): FighterRef {
  return { fighterId: id, name: `Fighter ${id}`, club: "" };
}

function pool(overrides: Partial<Pool>): Pool {
  return {
    id: "p1",
    nominationId: "n1",
    nominationName: "Длинный меч",
    number: 1,
    name: "Пул 1",
    members: [],
    status: "POOL_STATUS_NOT_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
    stageId: "stage-groups",
    ...overrides,
  };
}

function bout(overrides: Partial<BoardBout>): BoardBout {
  return {
    id: "b1",
    roundNumber: 1,
    sequenceNumber: 1,
    fighterA: fighter("f1"),
    fighterB: fighter("f2"),
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    ...overrides,
  };
}

function livePool(overrides: Partial<LivePoolDto>): LivePoolDto {
  return { pool: pool({}), bouts: [], currentBoutId: "", ...overrides };
}

function stage(overrides: Partial<Stage>): Stage {
  return {
    id: "stage-groups",
    nominationId: "n1",
    position: 0,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_READY",
    bracket: null,
    groups: { groupCount: 1 },
    rule: null,
    executionStatus: "STAGE_STATUS_ACTIVE",
    ...overrides,
  };
}

function bracketSlot(overrides: Partial<BracketSlot>): BracketSlot {
  return {
    slot: 1,
    state: "BRACKET_SLOT_STATE_FILLED",
    fighter: fighter("f1"),
    sourceLabel: "",
    ...overrides,
  };
}

function bracketPair(overrides: Partial<BracketPair>): BracketPair {
  return {
    index: 1,
    slotA: bracketSlot({ slot: 1, fighter: fighter("f1") }),
    slotB: bracketSlot({ slot: 2, fighter: fighter("f2") }),
    bout: null,
    resolved: false,
    ...overrides,
  };
}

function bracketRound(overrides: Partial<BracketRound>): BracketRound {
  return {
    number: 1,
    title: "1/4 финала",
    thirdPlace: false,
    halves: [
      {
        half: 1,
        title: "",
        container: pool({ id: "container-1" }),
        pairs: [bracketPair({})],
        currentBoutId: "",
      },
    ],
    ...overrides,
  };
}

function bracket(overrides: Partial<Bracket>): Bracket {
  return {
    stage: stage({ id: "stage-bracket", type: "STAGE_TYPE_BRACKET", groups: null, bracket: { size: 4, thirdPlace: false } }),
    rounds: [bracketRound({})],
    unassigned: [],
    canUndo: false,
    champion: null,
    thirdPlaceWinner: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<NominationLiveSnapshotDto>): NominationLiveSnapshotDto {
  return {
    nominationId: "n1",
    pools: [],
    stages: [],
    brackets: [],
    results: emptyNominationResults("n1"),
    ...overrides,
  };
}

describe("entities/stage/lib/progress stageProgressFromSnapshot", () => {
  it("aggregates fighters and bout progress for a group stage across its pools (спека 0032, FR-18)", () => {
    const snap = snapshot({
      pools: [
        livePool({
          pool: pool({ id: "p1", stageId: "stage-groups", members: [fighter("f1"), fighter("f2")] }),
          bouts: [bout({ state: "BOUT_STATE_FINISHED" }), bout({ id: "b2", state: "BOUT_STATE_NOT_STARTED" })],
        }),
        livePool({
          pool: pool({ id: "p2", stageId: "stage-groups", members: [fighter("f3")] }),
          bouts: [bout({ id: "b3", state: "BOUT_STATE_FINISHED" })],
        }),
      ],
    });

    const progress = stageProgressFromSnapshot(snap);

    expect(progress["stage-groups"]).toEqual({ fighters: 3, boutsTotal: 3, boutsFinished: 2 });
  });

  it("aggregates fighters (round-1 filled slots) and materialized bouts for a bracket stage", () => {
    const snap = snapshot({
      brackets: [
        bracket({
          stage: stage({ id: "stage-bracket", type: "STAGE_TYPE_BRACKET", groups: null, bracket: { size: 4, thirdPlace: false } }),
          rounds: [
            bracketRound({
              number: 1,
              halves: [
                {
                  half: 1,
                  title: "",
                  container: pool({ id: "c1" }),
                  pairs: [
                    bracketPair({ index: 1, bout: bout({ id: "b1", state: "BOUT_STATE_FINISHED" }), resolved: true }),
                    bracketPair({
                      index: 2,
                      slotA: bracketSlot({ slot: 3, fighter: fighter("f3") }),
                      slotB: bracketSlot({ slot: 4, state: "BRACKET_SLOT_STATE_EMPTY", fighter: fighter("") }),
                      bout: null,
                    }),
                  ],
                  currentBoutId: "",
                },
              ],
            }),
            bracketRound({
              number: 2,
              title: "Финал",
              halves: [
                {
                  half: 1,
                  title: "",
                  container: pool({ id: "c2" }),
                  pairs: [bracketPair({ index: 1, bout: bout({ id: "b2", state: "BOUT_STATE_NOT_STARTED" }), resolved: false })],
                  currentBoutId: "",
                },
              ],
            }),
          ],
        }),
      ],
    });

    const progress = stageProgressFromSnapshot(snap);

    // Round-1 filled slots: f1, f2 (pair 1) + f3 (pair 2, slotB empty) = 3 fighters.
    // Materialized bouts across all rounds: b1 (finished) + b2 (not started) = 2 total, 1 finished.
    expect(progress["stage-bracket"]).toEqual({ fighters: 3, boutsTotal: 2, boutsFinished: 1 });
  });

  it("omits a draft stage that has no record in the snapshot yet", () => {
    const snap = snapshot({ stages: [stage({ id: "stage-draft", status: "POOL_LAYOUT_STATUS_DRAFT" })] });

    const progress = stageProgressFromSnapshot(snap);

    expect(progress["stage-draft"]).toBeUndefined();
  });

  it("handles a mixed schema: one group stage with pools, one bracket stage, one draft stage absent", () => {
    const snap = snapshot({
      pools: [
        livePool({
          pool: pool({ id: "p1", stageId: "stage-groups", members: [fighter("f1")] }),
          bouts: [bout({ state: "BOUT_STATE_FINISHED" })],
        }),
      ],
      brackets: [bracket({})],
    });

    const progress = stageProgressFromSnapshot(snap);

    expect(Object.keys(progress).sort()).toEqual(["stage-bracket", "stage-groups"]);
    expect(progress["stage-groups"]).toEqual({ fighters: 1, boutsTotal: 1, boutsFinished: 1 });
  });
});
