// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArenaScoreboard } from "./arena-scoreboard";
import type { ArenaLiveSnapshotDto } from "@/entities/arena-live/lib/types";
import type { BoutBoard, Pool, BoardBout } from "@/entities/pool/lib/types";

vi.mock("@/features/arena-live/api/use-arena-live", () => ({
  useArenaLive: vi.fn(),
}));
vi.mock("@/features/arena-timer/api/use-arena-timer", () => ({
  useArenaTimer: vi.fn(() => ({
    display: { status: "STOPPED", remainingCs: 9000 },
    controls: { start: vi.fn(), pause: vi.fn(), reset: vi.fn(), adjust: vi.fn() },
  })),
}));

import { useArenaLive } from "@/features/arena-live/api/use-arena-live";

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
  standings: [],
};

function bout(partial: Partial<BoardBout> & { id: string; sequenceNumber: number }): BoardBout {
  return {
    id: partial.id,
    roundNumber: 1,
    sequenceNumber: partial.sequenceNumber,
    fighterA: partial.fighterA ?? { fighterId: `${partial.id}-a`, name: `${partial.id} Fighter A`, club: "" },
    fighterB: partial.fighterB ?? { fighterId: `${partial.id}-b`, name: `${partial.id} Fighter B`, club: "" },
    state: partial.state ?? "BOUT_STATE_NOT_STARTED",
    scoreA: partial.scoreA ?? 0,
    scoreB: partial.scoreB ?? 0,
  };
}

function makeSnapshot(board: BoutBoard | null, sidesSwapped = false, revealGeneration = 0): ArenaLiveSnapshotDto {
  return {
    board,
    timer: { status: "TIMER_STATUS_STOPPED", remainingCs: 9000, sampledUnixMs: "0", defaultCs: 9000 },
    room: { scoreboardCount: 1, thisOrdinal: 1, thisIsSource: true, sidesSwapped, revealGeneration },
    defaultDurationSeconds: 90,
    serverNowUnixMs: "0",
  };
}

function mockLive(snapshot: ArenaLiveSnapshotDto | null) {
  vi.mocked(useArenaLive).mockReturnValue({
    snapshot,
    serverOffsetMs: 0,
    onCommand: () => () => {},
  });
}


describe("ArenaScoreboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the neutral waiting state when there is no board/pool (FR-5)", () => {
    mockLive(makeSnapshot(null));
    render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
    expect(screen.getByText("Ожидание боя…")).toBeInTheDocument();
    expect(screen.getByText("Ристалище 1")).toBeInTheDocument();
  });

  it("shows the neutral waiting state when board.pool is null", () => {
    mockLive(makeSnapshot({ pool: null, bouts: [], currentBoutId: "" }));
    render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
    expect(screen.getByText("Ожидание боя…")).toBeInTheDocument();
  });

  it("renders blue/red fighters with the score attached to the fighter, not the side (swap, AC-5)", () => {
    const b1 = bout({
      id: "b1",
      sequenceNumber: 1,
      state: "BOUT_STATE_IN_PROGRESS",
      fighterA: { fighterId: "fa", name: "Alice", club: "Sokol" },
      fighterB: { fighterId: "fb", name: "Bob", club: "Berkut" },
      scoreA: 5,
      scoreB: 3,
    });
    const board: BoutBoard = { pool, bouts: [b1], currentBoutId: "b1" };
    mockLive(makeSnapshot(board, true)); // swapped: A becomes blue, B becomes red

    render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

    const blue = document.querySelector('[data-color="blue"]');
    const red = document.querySelector('[data-color="red"]');
    expect(blue?.textContent).toContain("Alice");
    expect(blue?.textContent).toContain("5");
    expect(red?.textContent).toContain("Bob");
    expect(red?.textContent).toContain("3");
  });

  it("shows the next unplayed bout, or a last-bout label when there isn't one", () => {
    const b1 = bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" });
    const b2 = bout({
      id: "b2",
      sequenceNumber: 2,
      fighterA: { fighterId: "c", name: "Carol", club: "" },
      fighterB: { fighterId: "d", name: "Dave", club: "" },
    });
    const board: BoutBoard = { pool, bouts: [b1, b2], currentBoutId: "b1" };
    mockLive(makeSnapshot(board));

    render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
    expect(screen.getByText("Далее: Carol — Dave")).toBeInTheDocument();
  });

  it("shows a last-bout label when the current bout is the last unplayed one", () => {
    const b1 = bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" });
    const board: BoutBoard = { pool, bouts: [b1], currentBoutId: "b1" };
    mockLive(makeSnapshot(board));

    render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
    expect(screen.getByText("Последний бой пула")).toBeInTheDocument();
  });

  it("announces the winner and holds it — does not vanish immediately when currentBoutId auto-advances (AC-11a)", () => {
    const b1 = bout({
      id: "b1",
      sequenceNumber: 1,
      state: "BOUT_STATE_FINISHED",
      fighterA: { fighterId: "fa", name: "Alice", club: "" },
      fighterB: { fighterId: "fb", name: "Bob", club: "" },
      scoreA: 7,
      scoreB: 4,
    });
    const b2 = bout({ id: "b2", sequenceNumber: 2, state: "BOUT_STATE_NOT_STARTED" });

    // Mount while b1 is still the (live) current bout — the widget seeds
    // displayedBoutId from this first snapshot; the hold logic only kicks in
    // once we *observe* a currentBoutId transition on a later render.
    const boardWhileB1Current: BoutBoard = { pool, bouts: [b1, b2], currentBoutId: "b1" };
    mockLive(makeSnapshot(boardWhileB1Current));
    const view = render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

    // The live channel then delivers the post-finish snapshot: server
    // already auto-advanced currentBoutId to b2 (0013 FinishCurrentBout),
    // same as it would arrive on the very first SSE frame after finishing.
    // b2 is still NOT_STARTED — the widget must keep showing b1's outcome.
    const boardAfterFinish: BoutBoard = { pool, bouts: [b1, b2], currentBoutId: "b2" };
    mockLive(makeSnapshot(boardAfterFinish));
    view.rerender(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

    expect(screen.getByTestId("outcome-announcement").textContent).toContain("Alice");
    expect(document.querySelector('[data-color="blue"]')?.textContent).toContain("Bob");
    expect(document.querySelector('[data-color="red"]')?.textContent).toContain("Alice");

    // Secretary starts b2 — now the hold releases and the board switches over.
    const boardB2Started: BoutBoard = {
      pool,
      bouts: [b1, { ...b2, state: "BOUT_STATE_IN_PROGRESS" }],
      currentBoutId: "b2",
    };
    mockLive(makeSnapshot(boardB2Started));
    view.rerender(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

    expect(screen.queryByTestId("outcome-announcement")).not.toBeInTheDocument();
    expect(document.querySelector('[data-color="blue"]')?.textContent).toContain(b2.fighterB.name);
  });

  it("releases the hold when the secretary manually circulates to a different not-started bout (not just the auto-advance target)", () => {
    const b1 = bout({
      id: "b1",
      sequenceNumber: 1,
      state: "BOUT_STATE_FINISHED",
      fighterA: { fighterId: "fa", name: "Alice", club: "" },
      fighterB: { fighterId: "fb", name: "Bob", club: "" },
      scoreA: 7,
      scoreB: 4,
    });
    const b2 = bout({ id: "b2", sequenceNumber: 2, state: "BOUT_STATE_NOT_STARTED" });
    const b3 = bout({
      id: "b3",
      sequenceNumber: 3,
      state: "BOUT_STATE_NOT_STARTED",
      fighterA: { fighterId: "fc", name: "Carol", club: "" },
      fighterB: { fighterId: "fd", name: "Dave", club: "" },
    });

    const boardWhileB1Current: BoutBoard = { pool, bouts: [b1, b2, b3], currentBoutId: "b1" };
    mockLive(makeSnapshot(boardWhileB1Current));
    const view = render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

    // Finish b1: server auto-advances currentBoutId to b2 — the widget holds
    // b1's outcome (same as the AC-11a test above).
    const boardAfterFinish: BoutBoard = { pool, bouts: [b1, b2, b3], currentBoutId: "b2" };
    mockLive(makeSnapshot(boardAfterFinish));
    view.rerender(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
    expect(screen.getByTestId("outcome-announcement")).toBeInTheDocument();

    // Secretary does NOT start b2 — instead manually circulates (SetCurrentBout)
    // to b3, a completely different not-started bout. The board must drop the
    // hold and show b3 immediately, not stay stuck on b1's announcement.
    const boardCirculatedToB3: BoutBoard = { pool, bouts: [b1, b2, b3], currentBoutId: "b3" };
    mockLive(makeSnapshot(boardCirculatedToB3));
    view.rerender(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

    expect(screen.queryByTestId("outcome-announcement")).not.toBeInTheDocument();
    expect(document.querySelector('[data-color="blue"]')?.textContent).toContain("Dave");
    expect(document.querySelector('[data-color="red"]')?.textContent).toContain("Carol");
  });

  it("releases the hold immediately on RevealCurrentBout (room.revealGeneration bump), even though the next bout is still NOT_STARTED", () => {
    const b1 = bout({
      id: "b1",
      sequenceNumber: 1,
      state: "BOUT_STATE_FINISHED",
      fighterA: { fighterId: "fa", name: "Alice", club: "" },
      fighterB: { fighterId: "fb", name: "Bob", club: "" },
      scoreA: 7,
      scoreB: 4,
    });
    const b2 = bout({
      id: "b2",
      sequenceNumber: 2,
      state: "BOUT_STATE_NOT_STARTED",
      fighterA: { fighterId: "fc", name: "Carol", club: "" },
      fighterB: { fighterId: "fd", name: "Dave", club: "" },
    });

    const boardWhileB1Current: BoutBoard = { pool, bouts: [b1, b2], currentBoutId: "b1" };
    mockLive(makeSnapshot(boardWhileB1Current, false, 0));
    const view = render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

    // Finish b1: server auto-advances currentBoutId to b2 — hold engages,
    // same reveal_generation (0) as before.
    const boardAfterFinish: BoutBoard = { pool, bouts: [b1, b2], currentBoutId: "b2" };
    mockLive(makeSnapshot(boardAfterFinish, false, 0));
    view.rerender(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
    expect(screen.getByTestId("outcome-announcement")).toBeInTheDocument();
    expect(document.querySelector('[data-color="blue"]')?.textContent).toContain("Bob");

    // Secretary clicks "Показать следующий бой" on the panel — server bumps
    // room.revealGeneration and broadcasts it to this table. b2 is STILL
    // NOT_STARTED (secretary hasn't pressed Старт yet) — the table must
    // reveal it anyway (0:0, waiting), not wait for it to start.
    const boardRevealed: BoutBoard = { pool, bouts: [b1, b2], currentBoutId: "b2" };
    mockLive(makeSnapshot(boardRevealed, false, 1));
    view.rerender(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

    expect(screen.queryByTestId("outcome-announcement")).not.toBeInTheDocument();
    expect(document.querySelector('[data-color="blue"]')?.textContent).toContain("Dave");
    expect(document.querySelector('[data-color="blue"]')?.textContent).toContain("0");
    expect(document.querySelector('[data-color="red"]')?.textContent).toContain("Carol");
  });

  it("announces a draw", () => {
    const b1 = bout({
      id: "b1",
      sequenceNumber: 1,
      state: "BOUT_STATE_FINISHED",
      fighterA: { fighterId: "fa", name: "Alice", club: "" },
      fighterB: { fighterId: "fb", name: "Bob", club: "" },
      scoreA: 4,
      scoreB: 4,
    });
    const board: BoutBoard = { pool, bouts: [b1], currentBoutId: "b1" };
    mockLive(makeSnapshot(board));

    render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
    expect(screen.getByTestId("outcome-announcement").textContent).toContain("Ничья");
  });
});
