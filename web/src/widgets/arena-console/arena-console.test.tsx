// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoutBoard } from "@/entities/pool/lib/types";
import { ArenaConsole } from "./arena-console";

const push = vi.fn();
let searchParamsState = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParamsState,
}));

let liveState = {
  snapshot: null as { board: BoutBoard | null } | null,
  serverOffsetMs: 0,
  onCommand: () => () => {},
  connection: "live" as "live" | "lost",
  lostSinceMs: null as number | null,
  reconnect: vi.fn(),
};

vi.mock("@/features/arena-live/api/use-arena-live", () => ({
  useArenaLive: vi.fn(() => liveState),
}));
vi.mock("@/features/arena-timer/api/use-arena-timer", () => ({
  useArenaTimer: vi.fn(() => ({
    display: { status: "STOPPED", remainingCs: 9000 },
    controls: { start: vi.fn(), pause: vi.fn(), reset: vi.fn(), adjust: vi.fn() },
  })),
}));

vi.mock("./management-view", () => ({
  ManagementView: ({ onEnterBoutPanel }: { onEnterBoutPanel: () => void }) => (
    <div data-testid="management-view">
      <button type="button" onClick={onEnterBoutPanel}>
        Вести бой в панели ⛶
      </button>
    </div>
  ),
}));
vi.mock("./bout-panel-view", () => ({
  BoutPanelView: () => <div data-testid="bout-panel-view" />,
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsState = new URLSearchParams();
  liveState = {
    snapshot: null,
    serverOffsetMs: 0,
    onCommand: () => () => {},
    connection: "live",
    lostSinceMs: null,
    reconnect: vi.fn(),
  };
});

function fighter(id: string, name: string) {
  return { fighterId: id, name, club: "" };
}

function seatedBoard(): BoutBoard {
  return {
    pool: {
      id: "pool-1",
      nominationId: "n1",
      nominationName: "Длинный меч",
      number: 1,
      name: "Пул C",
      members: [],
      status: "POOL_STATUS_ACTIVE",
      arenaId: "a1",
      arenaName: "Арена 1",
      standings: [],
    },
    bouts: [
      {
        id: "b1",
        roundNumber: 1,
        sequenceNumber: 7,
        fighterA: fighter("f1", "A"),
        fighterB: fighter("f2", "B"),
        state: "BOUT_STATE_IN_PROGRESS",
        scoreA: 4,
        scoreB: 6,
      },
    ],
    currentBoutId: "b1",
  };
}

describe("ArenaConsole (спека 0033, FR-1..FR-5)", () => {
  it("renders ManagementView by default (no ?mode)", () => {
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    expect(screen.getByTestId("management-view")).toBeInTheDocument();
  });

  it("renders BoutPanelView when ?mode=bout is present", () => {
    searchParamsState = new URLSearchParams("mode=bout");
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    expect(screen.getByTestId("bout-panel-view")).toBeInTheDocument();
  });

  it("AC-1: entering the panel from the current-bout button navigates to ?mode=bout on the same path", () => {
    liveState.snapshot = { board: seatedBoard() };
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);

    fireEvent.click(screen.getByRole("button", { name: "Вести бой в панели ⛶" }));

    expect(push).toHaveBeenCalledWith("/admin/arenas/a1?mode=bout");
  });

  it("AC-2: the mode switch back button navigates to the path without ?mode", () => {
    searchParamsState = new URLSearchParams("mode=bout");
    liveState.snapshot = { board: seatedBoard() };
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);

    fireEvent.click(screen.getByRole("button", { name: /Арена 1 · управление/ }));

    expect(push).toHaveBeenCalledWith("/admin/arenas/a1");
  });

  it("AC-2: Esc returns from bout mode to management", () => {
    searchParamsState = new URLSearchParams("mode=bout");
    liveState.snapshot = { board: seatedBoard() };
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(push).toHaveBeenCalledWith("/admin/arenas/a1");
  });

  it("Esc does nothing in management mode", () => {
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(push).not.toHaveBeenCalled();
  });

  it("AC-3: the mode switch to bout is disabled when no pool is seated, with an explanation", () => {
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    const switchButton = screen.getByRole("button", { name: "Ведение боя ⛶" });
    expect(switchButton).toBeDisabled();
    expect(switchButton).toHaveAttribute("title", "Пул не стоит — вести нечего");
  });

  it("the mode switch to bout is enabled when a pool is seated", () => {
    liveState.snapshot = { board: seatedBoard() };
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    expect(screen.getByRole("button", { name: "Ведение боя ⛶" })).toBeEnabled();
  });

  it("AC-11: shows the connection bar when the live channel is lost", () => {
    liveState.connection = "lost";
    liveState.lostSinceMs = Date.now();
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    expect(screen.getByRole("status")).toHaveTextContent("Связь потеряна");
  });

  it("does not show the connection bar while connected", () => {
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("FR-11: the scoreboard link is present in both modes", () => {
    const { rerender } = render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    expect(screen.getByRole("link", { name: "Открыть табло" })).toHaveAttribute(
      "href",
      "/admin/arenas/a1/scoreboard",
    );

    cleanup();
    searchParamsState = new URLSearchParams("mode=bout");
    render(<ArenaConsole arenaId="a1" arenaName="Арена 1" initialBoard={null} defaultDurationSeconds={90} />);
    expect(screen.getByRole("link", { name: "Открыть табло" })).toBeInTheDocument();
    void rerender;
  });
});
