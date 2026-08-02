// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimerControls } from "./TimerControls";
import type { ArenaLiveSnapshotDto } from "@/entities/arena-live/lib/types";

const controls = {
  start: vi.fn(),
  pause: vi.fn(),
  reset: vi.fn(),
  adjust: vi.fn(),
};

const baseSnapshot: ArenaLiveSnapshotDto = {
  board: null,
  timer: { status: "TIMER_STATUS_STOPPED", remainingCs: 9000, sampledUnixMs: "0", defaultCs: 9000 },
  room: { scoreboardCount: 1, thisOrdinal: 0, thisIsSource: false, sidesSwapped: false, revealGeneration: 0 },
  defaultDurationSeconds: 90,
  serverNowUnixMs: "0",
};

// Мутируемые по тестам заглушки: разные тесты выставляют разное board/status
// перед рендером (доска влияет на handleStart, status — на disabled).
let snapshot: ArenaLiveSnapshotDto = baseSnapshot;
let displayStatus: "STOPPED" | "RUNNING" | "PAUSED" | "EXPIRED" = "STOPPED";

const fighter = (name: string) => ({ fighterId: name, name, club: "" });

function boardWithCurrentBout(state: "BOUT_STATE_NOT_STARTED" | "BOUT_STATE_IN_PROGRESS") {
  return {
    pool: {
      id: "pool-1",
      nominationId: "n1",
      nominationName: "",
      number: 1,
      name: "Пул 1",
      members: [],
      status: "POOL_STATUS_PREPARING" as const,
      arenaId: "a1",
      arenaName: "",
    },
    bouts: [
      {
        id: "bout-1",
        roundNumber: 1,
        sequenceNumber: 1,
        fighterA: fighter("A"),
        fighterB: fighter("B"),
        state,
        scoreA: 0,
        scoreB: 0,
      },
    ],
    currentBoutId: "bout-1",
  };
}

vi.mock("@/features/arena-live/api/use-arena-live", () => ({
  useArenaLive: vi.fn(() => ({ snapshot, serverOffsetMs: 0, onCommand: () => () => {} })),
}));
vi.mock("@/features/arena-timer/api/use-arena-timer", () => ({
  useArenaTimer: vi.fn(() => ({
    display: { status: displayStatus, remainingCs: 9000 },
    controls,
  })),
}));

function renderControls() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TimerControls arenaId="a1" />
    </QueryClientProvider>,
  );
}

describe("TimerControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot = baseSnapshot;
    displayStatus = "STOPPED";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  afterEach(() => {
    cleanup();
  });

  it("start/pause/reset buttons call the corresponding controls.* function", () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Старт" }));
    expect(controls.start).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Пауза" }));
    expect(controls.pause).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Сброс" }));
    expect(controls.reset).toHaveBeenCalledTimes(1);
  });

  it("Старт is disabled while the timer is RUNNING", () => {
    displayStatus = "RUNNING";
    renderControls();

    expect(screen.getByRole("button", { name: "Старт" })).toBeDisabled();
  });

  it("Старт is enabled when the timer is STOPPED/PAUSED/EXPIRED", () => {
    displayStatus = "PAUSED";
    renderControls();

    expect(screen.getByRole("button", { name: "Старт" })).toBeEnabled();
  });

  it("clicking Старт also starts the bout when the current bout is not started", async () => {
    snapshot = { ...baseSnapshot, board: boardWithCurrentBout("BOUT_STATE_NOT_STARTED") };
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Старт" }));

    expect(controls.start).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/pools/pool-1/bout",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "start" }),
        }),
      ),
    );
  });

  it("clicking Старт does not start the bout when it is already in progress", () => {
    snapshot = { ...baseSnapshot, board: boardWithCurrentBout("BOUT_STATE_IN_PROGRESS") };
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Старт" }));

    expect(controls.start).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/pools/pool-1/bout",
      expect.anything(),
    );
  });

  it("±N buttons call controls.adjust with the signed amount", () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "+3с" }));
    expect(controls.adjust).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: "−2с" }));
    expect(controls.adjust).toHaveBeenCalledWith(-2);
  });

  it("sets the default duration via PUT /default-duration", async () => {
    renderControls();

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Задать" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/arenas/a1/default-duration",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ defaultDurationSeconds: 120 }),
        }),
      ),
    );
  });

  it("toggles sides via POST /scoreboard-sides with the negated current value", async () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Поменять стороны" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/arenas/a1/scoreboard-sides",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ swapped: true }),
        }),
      ),
    );
  });
});
