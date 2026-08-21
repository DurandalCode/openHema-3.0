// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoutBoard } from "@/entities/pool/lib/types";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import { ManagementView } from "./management-view";

vi.mock("@/features/pool-seating/ui/pool-seating", () => ({
  PoolSeating: ({ arenaId }: { arenaId: string }) => <div data-testid="pool-seating">{arenaId}</div>,
}));
vi.mock("@/features/arena-timer/ui/TimerControls", () => ({
  TimerControls: () => <div data-testid="timer-controls" />,
}));

const setCurrentMutate = vi.fn();
const unseatMutate = vi.fn((_poolId, opts) => opts?.onSuccess?.());
const seatMutate = vi.fn();
const finishMutate = vi.fn();
const revealMutate = vi.fn();
const reopenMutate = vi.fn();
const resetMutate = vi.fn();

vi.mock("@/features/bout-board/api/use-set-current-bout", () => ({
  useSetCurrentBout: () => ({ mutate: setCurrentMutate, isPending: false }),
}));
vi.mock("@/features/pool-seating/api/use-unseat-pool", () => ({
  useUnseatPool: () => ({ mutate: unseatMutate, isPending: false }),
}));
vi.mock("@/features/pool-seating/api/use-seat-pool", () => ({
  useSeatPool: () => ({ mutate: seatMutate }),
}));
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

vi.mock("@/shared/lib/toast", () => ({
  toastUndo: vi.fn(),
  toastError: vi.fn(),
}));

import { toastError, toastUndo } from "@/shared/lib/toast";

const timerDisplay = { status: "STOPPED" as const, remainingCs: 9000 };
const timerControls = { start: vi.fn(), pause: vi.fn(), reset: vi.fn(), adjust: vi.fn() };

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

function makeLive(board: BoutBoard | null): UseArenaLiveResult {
  return {
    snapshot: board
      ? {
          board,
          timer: { status: "TIMER_STATUS_STOPPED", remainingCs: 9000, sampledUnixMs: "0", defaultCs: 9000 },
          room: { scoreboardCount: 0, thisOrdinal: 0, thisIsSource: false, sidesSwapped: false, revealGeneration: 0 },
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

function seatedBoard(): BoutBoard {
  const fighter = (id: string, name: string) => ({ fighterId: id, name, club: "" });
  return {
    pool: {
      id: "pool-1",
      nominationId: "n1",
      nominationName: "Длинный меч",
      number: 1,
      name: "Пул A",
      members: [fighter("f1", "Кравцов"), fighter("f2", "Гринёв")],
      status: "POOL_STATUS_ACTIVE",
      arenaId: "a1",
      arenaName: "Арена 1",
      standings: [],
    },
    bouts: [
      {
        id: "bout-1",
        roundNumber: 1,
        sequenceNumber: 1,
        fighterA: fighter("f1", "Кравцов"),
        fighterB: fighter("f2", "Гринёв"),
        state: "BOUT_STATE_IN_PROGRESS",
        scoreA: 4,
        scoreB: 6,
      },
    ],
    currentBoutId: "bout-1",
  };
}

describe("ManagementView (спека 0033, FR-6..FR-14)", () => {
  it("renders PoolSeating when the arena is free", () => {
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(null)}
        display={timerDisplay}
        controls={timerControls}
        offline={false}
        onEnterBoutPanel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pool-seating")).toBeInTheDocument();
  });

  it("FR-7: renders only ±1/2/3/5 step buttons, no manual input or Задать button", () => {
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(seatedBoard())}
        display={timerDisplay}
        controls={timerControls}
        offline={false}
        onEnterBoutPanel={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: "+1" })).toHaveLength(2);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Задать" })).not.toBeInTheDocument();
  });

  it("FR-8: renders the four bout actions in one row", () => {
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(seatedBoard())}
        display={timerDisplay}
        controls={timerControls}
        offline={false}
        onEnterBoutPanel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Завершить бой" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Показать следующий" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Переоткрыть предыдущий" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сбросить счёт" })).toBeInTheDocument();
  });

  it("AC-5: unseating an active bout succeeds and shows an undo toast that re-seats on click", () => {
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(seatedBoard())}
        display={timerDisplay}
        controls={timerControls}
        offline={false}
        onEnterBoutPanel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Снять пул с арены" }));

    expect(unseatMutate).toHaveBeenCalledWith("pool-1", expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(toastUndo).toHaveBeenCalledWith(
      expect.stringContaining("Пул A"),
      expect.objectContaining({ onUndo: expect.any(Function) }),
    );

    const onUndo = vi.mocked(toastUndo).mock.calls[0][1].onUndo;
    onUndo();
    expect(seatMutate).toHaveBeenCalledWith("pool-1");
  });

  it("shows an error toast without retry when unseating fails", () => {
    unseatMutate.mockImplementationOnce((_poolId, opts) => opts?.onError?.(new Error("арена занята")));
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(seatedBoard())}
        display={timerDisplay}
        controls={timerControls}
        offline={false}
        onEnterBoutPanel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Снять пул с арены" }));

    expect(toastError).toHaveBeenCalledWith("арена занята");
    expect(toastUndo).not.toHaveBeenCalled();
  });

  it("FR-9: Завершить бой is not disabled while the bout is in progress and connection is live", () => {
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(seatedBoard())}
        display={timerDisplay}
        controls={timerControls}
        offline={false}
        onEnterBoutPanel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Завершить бой" })).toBeEnabled();
  });

  it("AC-12: Завершить бой is disabled while offline", () => {
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(seatedBoard())}
        display={timerDisplay}
        controls={timerControls}
        offline={true}
        onEnterBoutPanel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Завершить бой" })).toBeDisabled();
  });

  it("shows the undo-step button when the score control reports an undo label (AC-8)", () => {
    scoreControlState.undoLabel = "Отменить +1 Кравцову";
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(seatedBoard())}
        display={timerDisplay}
        controls={timerControls}
        offline={false}
        onEnterBoutPanel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Отменить +1 Кравцову" }));
    expect(scoreControlState.undoLastStep).toHaveBeenCalledTimes(1);
  });
});

describe("ManagementView — вторая точка входа в панель (спека 0033, FR-4)", () => {
  it("clicking «Вести бой в панели» calls onEnterBoutPanel", () => {
    const onEnterBoutPanel = vi.fn();
    render(
      <ManagementView
        arenaId="a1"
        live={makeLive(seatedBoard())}
        display={timerDisplay}
        controls={timerControls}
        offline={false}
        onEnterBoutPanel={onEnterBoutPanel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Вести бой в панели ⛶" }));
    expect(onEnterBoutPanel).toHaveBeenCalledTimes(1);
  });
});
