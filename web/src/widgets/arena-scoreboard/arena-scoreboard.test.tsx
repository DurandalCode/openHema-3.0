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
import { useArenaTimer } from "@/features/arena-timer/api/use-arena-timer";

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
    // connection/lostSinceMs/reconnect (спека 0033, T21) — не под тестом
    // здесь; нейтральные значения только чтобы удовлетворить расширенный
    // тип `UseArenaLiveResult`.
    connection: "live",
    lostSinceMs: null,
    reconnect: () => {},
  });
}

function mockTimer(status: "STOPPED" | "RUNNING" | "PAUSED" | "EXPIRED", remainingCs: number) {
  vi.mocked(useArenaTimer).mockReturnValue({
    display: { status, remainingCs },
    controls: { start: vi.fn(), pause: vi.fn(), reset: vi.fn(), adjust: vi.fn() },
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

  // Спека 0033, трек E: полоса таймера сверху и крупнее счёта (FR-28/AC-14),
  // пять фаз табло вместо двух с половиной (FR-29/AC-15/AC-16).
  describe("scoreboardPhase-driven layout (spec 0033)", () => {
    it("AC-14: the timer strip is the top element and its digits are visually larger than the score", () => {
      const b1 = bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS", scoreA: 5, scoreB: 3 });
      const board: BoutBoard = { pool, bouts: [b1], currentBoutId: "b1" };
      mockLive(makeSnapshot(board));
      mockTimer("RUNNING", 9000);

      render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

      const strip = screen.getByTestId("timer-strip");
      const grid = document.querySelector('[data-color="blue"]')!.parentElement!;

      // DOM order: timer strip precedes the fighter grid (FR-28: "прижата к
      // верхнему краю").
      expect(strip.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      // Time is visually the largest element on the board: bigger text-size
      // utility at every breakpoint than the fighter score.
      const timeEl = strip.querySelector(".font-mono")!;
      const scoreEl = document.querySelector('[data-color="blue"] .font-mono')!;
      expect(timeEl.className).toContain("text-[7rem]");
      expect(scoreEl.className).toContain("text-[6rem]");
    });

    it("AC-15: endgame (<5s, amber) and expired (mig., red) render distinct classes", () => {
      const b1 = bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" });
      const board: BoutBoard = { pool, bouts: [b1], currentBoutId: "b1" };

      mockLive(makeSnapshot(board));
      mockTimer("RUNNING", 462); // 4.62s remaining, running — endgame (AC-15 "given")
      const endgameView = render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
      const endgameStrip = screen.getByTestId("timer-strip");
      expect(endgameStrip).toHaveAttribute("data-phase", "endgame");
      const endgameDigits = endgameStrip.querySelector(".font-mono")!.className;
      expect(endgameDigits).toContain("text-amber-400");
      expect(endgameDigits).not.toContain("text-red-500");
      endgameView.unmount();

      mockLive(makeSnapshot(board));
      mockTimer("EXPIRED", 0); // time hit zero (AC-15 "when")
      render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);
      const expiredStrip = screen.getByTestId("timer-strip");
      expect(expiredStrip).toHaveAttribute("data-phase", "expired");
      const expiredDigits = expiredStrip.querySelector(".font-mono")!.className;
      expect(expiredDigits).toContain("text-red-500");
      expect(expiredDigits).not.toContain("text-amber-400");

      // AC-15: the two states are visually distinct, not the same class list.
      expect(endgameDigits).not.toBe(expiredDigits);
    });

    it("AC-16: waiting state — new pair revealed but not started shows 0:0 and \"ОЖИДАНИЕ СТАРТА\", not \"ИДЁТ\"", () => {
      const b1 = bout({
        id: "b1",
        sequenceNumber: 1,
        state: "BOUT_STATE_NOT_STARTED",
        fighterA: { fighterId: "fc", name: "Carol", club: "" },
        fighterB: { fighterId: "fd", name: "Dave", club: "" },
      });
      const board: BoutBoard = { pool, bouts: [b1], currentBoutId: "b1" };
      mockLive(makeSnapshot(board));
      mockTimer("STOPPED", 9000);

      render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

      expect(screen.getByText("ОЖИДАНИЕ СТАРТА")).toBeInTheDocument();
      expect(screen.queryByText("ИДЁТ")).not.toBeInTheDocument();
      expect(document.querySelector('[data-color="blue"]')?.textContent).toContain("0");
      expect(document.querySelector('[data-color="red"]')?.textContent).toContain("0");
      expect(screen.getByTestId("timer-strip")).toHaveAttribute("data-phase", "waiting");
    });

    it("running phase shows a pulsing \"ИДЁТ\" indicator, reduced-motion-safe (NFR-4)", () => {
      const b1 = bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" });
      const board: BoutBoard = { pool, bouts: [b1], currentBoutId: "b1" };
      mockLive(makeSnapshot(board));
      mockTimer("RUNNING", 9000);

      render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

      const label = screen.getByTestId("timer-strip-label");
      expect(label.textContent).toBe("ИДЁТ");
      expect(label.className).toContain("motion-safe:animate-pulse");
    });

    it("expired phase blinks the whole strip background, reduced-motion-safe (NFR-4)", () => {
      const b1 = bout({ id: "b1", sequenceNumber: 1, state: "BOUT_STATE_IN_PROGRESS" });
      const board: BoutBoard = { pool, bouts: [b1], currentBoutId: "b1" };
      mockLive(makeSnapshot(board));
      mockTimer("EXPIRED", 0);

      render(<ArenaScoreboard arenaId="a1" arenaName="Ристалище 1" initialBoard={null} />);

      const strip = screen.getByTestId("timer-strip");
      expect(strip.className).toContain("motion-safe:animate-pulse");
      expect(screen.getByText("ВРЕМЯ ВЫШЛО")).toBeInTheDocument();
    });
  });
});
