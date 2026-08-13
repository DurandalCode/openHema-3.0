import { describe, expect, it } from "vitest";
import { arenaLiveStatus } from "./status";
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

describe("arenaLiveStatus", () => {
  it("returns free when board is null", () => {
    const status = arenaLiveStatus(null);
    expect(status).toEqual({ kind: "free", title: "Свободна", detail: null, pulse: false });
  });

  it("returns free when the board has no pool", () => {
    const board: BoutBoard = { pool: null, bouts: [], currentBoutId: "" };
    const status = arenaLiveStatus(board);
    expect(status).toEqual({ kind: "free", title: "Свободна", detail: null, pulse: false });
  });

  it("treats a pool without a single bout as preparing (edge case)", () => {
    const board: BoutBoard = { pool, bouts: [], currentBoutId: "" };
    const status = arenaLiveStatus(board);
    expect(status.kind).toBe("preparing");
    expect(status.title).toBe("Пул готовится");
    expect(status.detail).toBe("Длинный меч · Пул A");
    expect(status.pulse).toBe(false);
  });

  it("returns preparing when no bout has started yet", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1 }),
        bout({ id: "b2", sequenceNumber: 2 }),
      ],
      currentBoutId: "b1",
    };
    const status = arenaLiveStatus(board);
    expect(status.kind).toBe("preparing");
    expect(status.title).toBe("Пул готовится");
    expect(status.detail).toBe("Длинный меч · Пул A");
    expect(status.pulse).toBe(false);
  });

  it("returns finished when every bout of the pool is finished", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_FINISHED" }),
        bout({ id: "b2", sequenceNumber: 2, state: "BOUT_STATE_FINISHED" }),
      ],
      currentBoutId: "b2",
    };
    const status = arenaLiveStatus(board);
    expect(status.kind).toBe("finished");
    expect(status.title).toBe("Пул завершён");
    expect(status.detail).toBe("Длинный меч · Пул A");
    expect(status.pulse).toBe(false);
  });

  it("returns bout when the current bout is in progress (AC-2)", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        ...Array.from({ length: 13 }, (_, i) =>
          bout({ id: `f${i + 1}`, sequenceNumber: i + 1, state: "BOUT_STATE_FINISHED" }),
        ),
        bout({
          id: "current",
          sequenceNumber: 14,
          state: "BOUT_STATE_IN_PROGRESS",
          fighterA: fighter("a", "Кравцов"),
          fighterB: fighter("b", "Ильин"),
          scoreA: 3,
          scoreB: 2,
        }),
        ...Array.from({ length: 4 }, (_, i) =>
          bout({ id: `n${i + 1}`, sequenceNumber: 15 + i, state: "BOUT_STATE_NOT_STARTED" }),
        ),
      ],
      currentBoutId: "current",
    };
    const status = arenaLiveStatus(board);
    expect(status.kind).toBe("bout");
    expect(status.title).toBe("Идёт бой · Кравцов — Ильин");
    expect(status.detail).toBe("Длинный меч · Пул A · бой 14 из 18 · 3:2");
    expect(status.pulse).toBe(true);
  });

  it("returns between with the next bout's pair when nextBout finds one after the current bout", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_FINISHED" }),
        bout({
          id: "b2",
          sequenceNumber: 2,
          state: "BOUT_STATE_NOT_STARTED",
          fighterA: fighter("x", "Current A"),
          fighterB: fighter("y", "Current B"),
        }),
        bout({
          id: "b3",
          sequenceNumber: 3,
          state: "BOUT_STATE_NOT_STARTED",
          fighterA: fighter("p", "Петров"),
          fighterB: fighter("q", "Сидоров"),
        }),
      ],
      currentBoutId: "b2",
    };
    const status = arenaLiveStatus(board);
    expect(status.kind).toBe("between");
    expect(status.title).toBe("Между боями · далее Петров — Сидоров");
    expect(status.detail).toBe("Длинный меч · Пул A · бой 2 из 3");
    expect(status.pulse).toBe(false);
  });

  it("falls back to the next unplayed bout by sequence when nextBout returns null (AC-3)", () => {
    const board: BoutBoard = {
      pool,
      bouts: [
        bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_FINISHED" }),
        bout({
          id: "b2",
          sequenceNumber: 2,
          state: "BOUT_STATE_NOT_STARTED",
          fighterA: fighter("x", "Волков"),
          fighterB: fighter("y", "Лисицын"),
        }),
      ],
      currentBoutId: "b2",
    };
    const status = arenaLiveStatus(board);
    expect(status.kind).toBe("between");
    expect(status.title).toBe("Между боями · далее Волков — Лисицын");
    expect(status.detail).toBe("Длинный меч · Пул A · бой 2 из 2");
    expect(status.pulse).toBe(false);
  });
});
