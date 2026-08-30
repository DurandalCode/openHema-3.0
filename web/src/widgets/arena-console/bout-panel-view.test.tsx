// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoutBoard } from "@/entities/pool/lib/types";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import { BoutPanelView } from "./bout-panel-view";

vi.mock("@/features/arena-timer/ui/TimerControls", () => ({
  TimerControls: () => <div data-testid="timer-controls" />,
}));

const finishMutate = vi.fn();
const revealMutate = vi.fn();
const reopenMutate = vi.fn();
const resetMutate = vi.fn();

vi.mock("@/features/bout-board/api/use-finish-bout", () => ({
  useFinishBout: () => ({ mutate: finishMutate }),
}));
vi.mock("@/features/bout-board/api/use-reveal-bout", () => ({
  useRevealBout: () => ({ mutate: revealMutate }),
}));
vi.mock("@/features/bout-board/api/use-reopen-bout", () => ({
  useReopenBout: () => ({ mutate: reopenMutate }),
}));
vi.mock("@/features/bout-board/api/use-reset-bout", () => ({
  useResetBout: () => ({ mutate: resetMutate }),
}));

let scoreControlState = {
  scoreA: 4,
  scoreB: 6,
  pendingNotice: null as string | null,
  step: vi.fn(),
  undoLabel: null as string | null,
  undoLastStep: vi.fn(),
  isSending: false,
};
vi.mock("./use-bout-score-control", () => ({
  useBoutScoreControl: () => scoreControlState,
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  scoreControlState = {
    scoreA: 4,
    scoreB: 6,
    pendingNotice: null,
    step: vi.fn(),
    undoLabel: null,
    undoLastStep: vi.fn(),
    isSending: false,
  };
});

const timerDisplay = { status: "STOPPED" as const, remainingCs: 9000 };
const timerControls = { start: vi.fn(), pause: vi.fn(), reset: vi.fn(), adjust: vi.fn() };

function fighter(id: string, name: string) {
  return { fighterId: id, name, club: "" };
}

function makeLive(board: BoutBoard | null, sidesSwapped = false): UseArenaLiveResult {
  return {
    snapshot: board
      ? {
          board,
          timer: { status: "TIMER_STATUS_STOPPED", remainingCs: 9000, sampledUnixMs: "0", defaultCs: 9000 },
          room: { scoreboardCount: 0, thisOrdinal: 0, thisIsSource: false, sidesSwapped, revealGeneration: 0 },
          defaultDurationSeconds: 90,
          serverNowUnixMs: "0",
        }
      : null,
    serverOffsetMs: 0,
    onCommand: () => () => {},
    connection: "live",
    lostSinceMs: null,
    reconnect: () => {},
  };
}

function seatedBoard(overrides: Partial<{ bouts: BoutBoard["bouts"]; currentBoutId: string }> = {}): BoutBoard {
  const defaultBouts: BoutBoard["bouts"] = [
    {
      id: "bout-1",
      roundNumber: 1,
      sequenceNumber: 7,
      fighterA: fighter("f1", "Кравцов"),
      fighterB: fighter("f2", "Гринёв"),
      state: "BOUT_STATE_IN_PROGRESS",
      scoreA: 4,
      scoreB: 6,
    },
    {
      id: "bout-2",
      roundNumber: 1,
      sequenceNumber: 8,
      fighterA: fighter("f3", "Соколов"),
      fighterB: fighter("f4", "Берг"),
      state: "BOUT_STATE_NOT_STARTED",
      scoreA: 0,
      scoreB: 0,
    },
  ];
  return {
    pool: {
      id: "pool-1",
      nominationId: "n1",
      nominationName: "Длинный меч",
      number: 1,
      name: "Пул A",
      members: [],
      status: "POOL_STATUS_ACTIVE",
      arenaId: "a1",
      arenaName: "Арена 1",
      standings: [],
    },
    bouts: overrides.bouts ?? defaultBouts,
    currentBoutId: overrides.currentBoutId ?? "bout-1",
  };
}

function renderPanel(
  board: BoutBoard | null,
  offline = false,
  sidesSwapped = false,
  onReturnToManagement = vi.fn(),
  arenaName = "Арена 1",
) {
  return render(
    <BoutPanelView
      arenaId="a1"
      arenaName={arenaName}
      live={makeLive(board, sidesSwapped)}
      display={timerDisplay}
      controls={timerControls}
      offline={offline}
      onReturnToManagement={onReturnToManagement}
    />,
  );
}

describe("BoutPanelView (спека 0033, FR-15..FR-22)", () => {
  it("FR-15/AC-3: shows an explanation when there is no seated pool", () => {
    renderPanel(null);
    expect(screen.getByText("Пул не стоит — вести нечего.")).toBeInTheDocument();
  });

  it("FR-15: renders both fighters, their score and the timer column", () => {
    renderPanel(seatedBoard());
    expect(screen.getByText("Кравцов")).toBeInTheDocument();
    expect(screen.getByText("Гринёв")).toBeInTheDocument();
    expect(screen.getAllByText("4")).toHaveLength(1);
    expect(screen.getAllByText("6")).toHaveLength(1);
    expect(screen.getByTestId("timer-controls")).toBeInTheDocument();
  });

  it("FR-16: main +N buttons and secondary -N buttons meet the touch-size floor (64px/48px)", () => {
    renderPanel(seatedBoard());
    const plus1 = screen.getAllByRole("button", { name: "+1" })[0];
    const minus1 = screen.getAllByRole("button", { name: "−1" })[0];
    expect(plus1.className).toContain("h-16");
    expect(minus1.className).toContain("h-12");
  });

  it("colors sides by sideColorOfFighterA and flips on sidesSwapped", () => {
    const { rerender } = renderPanel(seatedBoard());
    // Fighter A (Кравцов) is red when not swapped.
    expect(screen.getByText("Кравцов").closest("div")?.parentElement?.className).toContain("bg-red-600");

    cleanup();
    renderPanel(seatedBoard(), false, true);
    expect(screen.getByText("Кравцов").closest("div")?.parentElement?.className).toContain("bg-blue-600");
    void rerender;
  });

  it("FR-18: clicking a step button calls scoreControl.step with the right side and delta", () => {
    renderPanel(seatedBoard());
    fireEvent.click(screen.getAllByRole("button", { name: "+2" })[0]);
    expect(scoreControlState.step).toHaveBeenCalledWith("A", 2, "красному");
  });

  it("FR-18: bottom bar renders Сбросить бой / Переоткрыть / Показать следующий / Завершить бой and Далее", () => {
    renderPanel(seatedBoard());
    expect(screen.getByRole("button", { name: "Сбросить бой" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Переоткрыть" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Показать следующий" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Завершить бой" })).toBeEnabled();
    expect(screen.getByText(/Далее: Соколов — Берг/)).toBeInTheDocument();
  });

  it("AC-12: Завершить бой is disabled while offline", () => {
    renderPanel(seatedBoard(), true);
    expect(screen.getByRole("button", { name: "Завершить бой" })).toBeDisabled();
  });

  it("FR-19/AC-8: shows the undo button when scoreControl reports a label", () => {
    scoreControlState.undoLabel = "Отменить +2 красному";
    renderPanel(seatedBoard());
    fireEvent.click(screen.getByRole("button", { name: "Отменить +2 красному" }));
    expect(scoreControlState.undoLastStep).toHaveBeenCalledTimes(1);
  });

  it("FR-26: shows the pending-offline notice when scoreControl reports one", () => {
    scoreControlState.pendingNotice = "Будет отправлен при восстановлении связи";
    renderPanel(seatedBoard());
    expect(screen.getByText("Будет отправлен при восстановлении связи")).toBeInTheDocument();
  });

  it("FR-22: Ctrl+Enter finishes the bout when it is in progress and online", () => {
    renderPanel(seatedBoard());
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(finishMutate).toHaveBeenCalledWith("pool-1", expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("FR-22: Ctrl+Enter does nothing while offline", () => {
    renderPanel(seatedBoard(), true);
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(finishMutate).not.toHaveBeenCalled();
  });

  it("FR-22: Space starts the timer when stopped", () => {
    renderPanel(seatedBoard());
    fireEvent.keyDown(window, { key: " " });
    expect(timerControls.start).toHaveBeenCalledTimes(1);
  });

  it("AC-9/FR-21: auto-returns to management when every bout in the pool is finished", () => {
    const onAutoReturn = vi.fn();
    renderPanel(
      seatedBoard({
        bouts: [
          {
            id: "bout-1",
            roundNumber: 1,
            sequenceNumber: 7,
            fighterA: fighter("f1", "Кравцов"),
            fighterB: fighter("f2", "Гринёв"),
            state: "BOUT_STATE_FINISHED",
            scoreA: 5,
            scoreB: 3,
          },
        ],
        currentBoutId: "bout-1",
      }),
      false,
      false,
      onAutoReturn,
    );
    expect(onAutoReturn).toHaveBeenCalledTimes(1);
  });

  it("does not auto-return while some bouts are still unplayed", () => {
    const onAutoReturn = vi.fn();
    renderPanel(seatedBoard(), false, false, onAutoReturn);
    expect(onAutoReturn).not.toHaveBeenCalled();
  });

  it("spec 0044 FR-7/AC-5: stacks the fighter halves and timer column vertically below sm so a 300px-wide timer column doesn't squeeze the halves off-screen at 360px", () => {
    renderPanel(seatedBoard());

    const timerColumn = screen.getByTestId("timer-controls").parentElement;
    expect(timerColumn?.className).toMatch(/(?:^|\s)w-full(?:\s|$)/);
    expect(timerColumn?.className).toMatch(/(?:^|\s)sm:w-\[300px\](?:\s|$)/);

    const row = timerColumn?.parentElement;
    expect(row?.className).toMatch(/(?:^|\s)flex-col(?:\s|$)/);
    expect(row?.className).toMatch(/(?:^|\s)sm:flex-row(?:\s|$)/);
  });

  describe("spec 0045, T6 — mobile compact header (FR-1/FR-2/AC-3)", () => {
    it("renders a single md:hidden row with a return button, the arena name and the bout number", () => {
      renderPanel(seatedBoard());
      const header = screen.getByTestId("mobile-bout-header");
      expect(header.className).toMatch(/(?:^|\s)md:hidden(?:\s|$)/);

      const returnButton = within(header).getByRole("button", { name: /Арена 1/ });
      expect(returnButton).toBeInTheDocument();
      expect(within(header).getByText(/Бой 1 из 2/)).toBeInTheDocument();
    });

    it("AC-3: clicking the return button switches the page to management mode", () => {
      const onReturnToManagement = vi.fn();
      renderPanel(seatedBoard(), false, false, onReturnToManagement);
      const header = screen.getByTestId("mobile-bout-header");

      fireEvent.click(within(header).getByRole("button", { name: /Арена 1/ }));

      expect(onReturnToManagement).toHaveBeenCalledTimes(1);
    });

    it("shows an offline indicator in the compact header while offline", () => {
      renderPanel(seatedBoard(), true);
      const header = screen.getByTestId("mobile-bout-header");
      expect(within(header).getByText("Офлайн")).toBeInTheDocument();
    });

    it("does not show an offline indicator while connected", () => {
      renderPanel(seatedBoard(), false);
      const header = screen.getByTestId("mobile-bout-header");
      expect(within(header).queryByText("Офлайн")).not.toBeInTheDocument();
    });
  });
});
