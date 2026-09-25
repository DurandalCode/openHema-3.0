// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoutBoard } from "@/entities/pool/lib/types";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import { BoutPanelView } from "./bout-panel-view";

vi.mock("@/features/arena-timer/ui/TimerControls", () => ({
  TimerControls: () => <div data-testid="timer-controls" />,
}));

vi.mock("./bout-timer-strip", () => ({
  BoutTimerStrip: ({
    arenaId,
    poolId,
    boutState,
    roundNumber,
    children,
  }: {
    arenaId: string;
    poolId: string | null;
    boutState: string;
    roundNumber: number | null;
    children: ReactNode;
  }) => (
    <div data-testid="bout-timer-strip" data-arena-id={arenaId} data-pool-id={poolId ?? ""} data-bout-state={boutState} data-round={roundNumber ?? ""}>
      {children}
    </div>
  ),
}));

vi.mock("./bout-actions-sheet", () => ({
  BoutActionsSheetContent: (props: {
    upNext: { fighterA: { name: string } } | null;
    canReset: boolean;
    canReopen: boolean;
    undoLabel: string | null;
  }) => (
    <div
      data-testid="bout-actions-sheet-content"
      data-up-next={props.upNext ? props.upNext.fighterA.name : ""}
      data-can-reset={String(props.canReset)}
      data-can-reopen={String(props.canReopen)}
      data-undo-label={props.undoLabel ?? ""}
    />
  ),
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

  it("spec 0045 T9/FR-9: +N/-N buttons grow on md: (tablet touch targets) without losing their mobile size", () => {
    renderPanel(seatedBoard());
    const plus1 = screen.getAllByRole("button", { name: "+1" })[0];
    const minus1 = screen.getAllByRole("button", { name: "−1" })[0];
    expect(plus1.className).toMatch(/(?:^|\s)h-16(?:\s|$)/);
    expect(plus1.className).toMatch(/(?:^|\s)md:h-\[84px\](?:\s|$)/);
    expect(minus1.className).toMatch(/(?:^|\s)h-12(?:\s|$)/);
    expect(minus1.className).toMatch(/(?:^|\s)md:h-\[52px\](?:\s|$)/);
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

  it("FR-18: desktop bottom bar renders Сбросить бой / Переоткрыть / Показать следующий / Завершить бой and Далее", () => {
    renderPanel(seatedBoard());
    const bar = screen.getByTestId("desktop-bottom-actions");
    expect(within(bar).getByRole("button", { name: "Сбросить бой" })).toBeEnabled();
    expect(within(bar).getByRole("button", { name: "Переоткрыть" })).toBeDisabled();
    expect(within(bar).getByRole("button", { name: "Показать следующий" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Завершить бой" })).toBeEnabled();
    expect(within(bar).getByText(/Далее: Соколов — Берг/)).toBeInTheDocument();
  });

  it("AC-12: Завершить бой is disabled while offline (desktop bottom bar)", () => {
    renderPanel(seatedBoard(), true);
    const bar = screen.getByTestId("desktop-bottom-actions");
    expect(within(bar).getByRole("button", { name: "Завершить бой" })).toBeDisabled();
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

  it("M17: Space on a focused action button keeps native activation and does not start the timer", () => {
    renderPanel(seatedBoard());
    const button = within(screen.getByTestId("desktop-bottom-actions")).getByRole("button", {
      name: "Показать следующий",
    });
    button.focus();

    const allowed = fireEvent.keyDown(button, { key: " ", code: "Space", cancelable: true });

    expect(allowed).toBe(true);
    expect(timerControls.start).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(revealMutate).toHaveBeenCalledTimes(1);
  });

  it("M17: Space in an open dialog does not control the background timer", () => {
    renderPanel(seatedBoard());
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const action = document.createElement("button");
    action.textContent = "Подтвердить";
    dialog.appendChild(action);
    document.body.appendChild(dialog);
    action.focus();

    const allowed = fireEvent.keyDown(action, { key: " ", code: "Space", cancelable: true });

    expect(allowed).toBe(true);
    expect(timerControls.start).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: " ", code: "Space" });
    expect(timerControls.start).not.toHaveBeenCalled();
    dialog.remove();
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

  it("spec 0045 T7: stacks the fighter halves vertically below md (unified breakpoint, was sm in 0044) and shows TimerControls in a hidden md:block column", () => {
    renderPanel(seatedBoard());

    const timerColumn = screen.getByTestId("timer-controls").parentElement;
    expect(timerColumn?.className).toMatch(/(?:^|\s)hidden(?:\s|$)/);
    expect(timerColumn?.className).toMatch(/(?:^|\s)md:block(?:\s|$)/);
    expect(timerColumn?.className).toMatch(/(?:^|\s)md:w-\[300px\](?:\s|$)/);

    const row = timerColumn?.parentElement;
    expect(row?.className).toMatch(/(?:^|\s)flex-col(?:\s|$)/);
    expect(row?.className).toMatch(/(?:^|\s)md:flex-row(?:\s|$)/);
  });

  describe("spec 0045, T7 — BoutTimerStrip between the fighter halves on md:hidden", () => {
    it("renders BoutTimerStrip in a md:hidden wrapper, nesting BoutActionsSheetContent inside it", () => {
      renderPanel(seatedBoard());

      const strip = screen.getByTestId("bout-timer-strip");
      expect(strip.parentElement?.className).toMatch(/(?:^|\s)md:hidden(?:\s|$)/);
      expect(within(strip).getByTestId("bout-actions-sheet-content")).toBeInTheDocument();
    });

    it("passes arena, pool, and current bout state to the mobile timer strip", () => {
      renderPanel(seatedBoard());
      const strip = screen.getByTestId("bout-timer-strip");
      expect(strip).toHaveAttribute("data-round", "1");
      expect(strip).toHaveAttribute("data-arena-id", "a1");
      expect(strip).toHaveAttribute("data-pool-id", "pool-1");
      expect(strip).toHaveAttribute("data-bout-state", "BOUT_STATE_IN_PROGRESS");
    });

    it("passes the next-bout preview, reset/reopen eligibility and the undo label to BoutActionsSheetContent", () => {
      scoreControlState.undoLabel = "Отменить +2 красному";
      renderPanel(seatedBoard());

      const sheetContent = screen.getByTestId("bout-actions-sheet-content");
      expect(sheetContent).toHaveAttribute("data-up-next", "Соколов");
      expect(sheetContent).toHaveAttribute("data-can-reset", "true");
      expect(sheetContent).toHaveAttribute("data-can-reopen", "false");
      expect(sheetContent).toHaveAttribute("data-undo-label", "Отменить +2 красному");
    });
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

  describe("spec 0045, T8 — bottom action row split by breakpoint (FR-6)", () => {
    it("mobile bottom bar (md:hidden) contains only Показать следующий and Завершить бой", () => {
      renderPanel(seatedBoard());
      const bar = screen.getByTestId("mobile-bottom-actions");
      expect(bar.className).toMatch(/(?:^|\s)md:hidden(?:\s|$)/);

      const buttons = within(bar).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual(["Показать следующий", "Завершить бой"]);
    });

    it("mobile bottom bar's Показать следующий/Завершить бой call reveal/finish exactly like the desktop bar", () => {
      renderPanel(seatedBoard());
      const bar = screen.getByTestId("mobile-bottom-actions");

      fireEvent.click(within(bar).getByRole("button", { name: "Показать следующий" }));
      expect(revealMutate).toHaveBeenCalledTimes(1);

      fireEvent.click(within(bar).getByRole("button", { name: "Завершить бой" }));
      expect(finishMutate).toHaveBeenCalledWith("pool-1", expect.objectContaining({ onError: expect.any(Function) }));
    });

    it("desktop bottom bar (hidden md:flex) keeps the full action set unchanged", () => {
      renderPanel(seatedBoard());
      const bar = screen.getByTestId("desktop-bottom-actions");
      expect(bar.className).toMatch(/(?:^|\s)hidden(?:\s|$)/);
      expect(bar.className).toMatch(/(?:^|\s)md:flex(?:\s|$)/);

      expect(within(bar).getByRole("button", { name: "Сбросить бой" })).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: "Переоткрыть" })).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: "Показать следующий" })).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: "Завершить бой" })).toBeInTheDocument();
    });
  });
});
