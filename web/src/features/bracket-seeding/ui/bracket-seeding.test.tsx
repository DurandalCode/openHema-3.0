// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BracketSeeding } from "./bracket-seeding";
import type { Bracket, BracketHalf, BracketPair, BracketSlot } from "@/entities/bracket/lib/types";
import type { FighterRef, Pool } from "@/entities/pool/lib/types";

function fighter(id: string): FighterRef {
  return { fighterId: id, name: id, club: "" };
}

function emptySlot(slot: number): BracketSlot {
  return { slot, state: "BRACKET_SLOT_STATE_EMPTY", fighter: fighter(""), sourceLabel: "" };
}

function filledSlot(slot: number, fighterId: string): BracketSlot {
  return {
    slot,
    state: "BRACKET_SLOT_STATE_FILLED",
    fighter: fighter(fighterId),
    sourceLabel: "",
  };
}

function container(name: string): Pool {
  return {
    id: "c1",
    nominationId: "n1",
    nominationName: "",
    number: 1,
    name,
    members: [],
    status: "POOL_STATUS_NOT_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
  };
}

function half(halfNum: number, title: string, pairs: BracketPair[]): BracketHalf {
  return { half: halfNum, title, container: container(title), pairs, currentBoutId: "" };
}

function pair(index: number, slotA: BracketSlot, slotB: BracketSlot): BracketPair {
  return { index, slotA, slotB, bout: null, resolved: false };
}

function draftBracket(): Bracket {
  return {
    stage: {
      id: "stage-1",
      nominationId: "n1",
      position: 1,
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      status: "POOL_LAYOUT_STATUS_DRAFT",
      bracket: { size: 4, thirdPlace: false },
      groups: null,
      rule: null,
    },
    rounds: [
      {
        number: 1,
        title: "1/2 финала",
        thirdPlace: false,
        halves: [
          half(1, "Верхняя половина", [pair(1, filledSlot(1, "b1"), emptySlot(2))]),
          half(2, "Нижняя половина", [pair(2, filledSlot(3, "b2"), emptySlot(4))]),
        ],
      },
    ],
    unassigned: [fighter("b3")],
    canUndo: false,
    champion: null,
    thirdPlaceWinner: null,
  };
}

function readyBracket(canUndo: boolean): Bracket {
  const b = draftBracket();
  return {
    ...b,
    canUndo,
    stage: { ...b.stage, status: "POOL_LAYOUT_STATUS_READY" },
  };
}

const seedMutate = vi.fn();
const clearMutate = vi.fn();
const resetMutate = vi.fn();
const undoMutate = vi.fn();
const setStatusMutate = vi.fn();
const toastUndoMock = vi.fn();
const toastErrorMock = vi.fn();

let bracketData: Bracket | undefined = draftBracket();
let setStatusError: Error | null = null;

vi.mock("../api/use-bracket", () => ({
  useBracket: () => ({ data: bracketData, isLoading: false, error: null }),
}));
vi.mock("../api/use-seed-slot", () => ({
  useSeedSlot: () => ({ mutate: seedMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-clear-slot", () => ({
  useClearSlot: () => ({ mutate: clearMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-reset-bracket", () => ({
  useResetBracket: () => ({ mutate: resetMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-undo-bracket", () => ({
  useUndoBracket: () => ({ mutate: undoMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-set-bracket-status", () => ({
  useSetBracketStatus: () => ({
    mutate: setStatusMutate,
    isPending: false,
    error: setStatusError,
  }),
}));
vi.mock("@/shared/lib/toast", () => ({
  toastUndo: (message: string, options: { onUndo: () => void }) => toastUndoMock(message, options),
  toastError: (message: string, options?: { retry?: () => void }) => toastErrorMock(message, options),
}));

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов, которых jsdom не реализует (см. `shared/ui/dialog.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

describe("BracketSeeding", () => {
  beforeEach(() => {
    bracketData = draftBracket();
    setStatusError = null;
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders unassigned fighters and first-round pairs grouped by half", () => {
    render(<BracketSeeding stageId="stage-1" />);

    expect(screen.getByText("Нераспределённые")).toBeInTheDocument();
    expect(screen.getByText("b3")).toBeInTheDocument();
    expect(screen.getByText("Верхняя половина")).toBeInTheDocument();
    expect(screen.getByText("Нижняя половина")).toBeInTheDocument();
    expect(screen.getByText("b1")).toBeInTheDocument();
    expect(screen.getByText("Слот 2 — пусто")).toBeInTheDocument();
  });

  it("clears a filled slot via its clear button", () => {
    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByLabelText("Освободить слот 1"));
    expect(clearMutate).toHaveBeenCalledWith(1);
  });

  it("fixes the bracket via the toolbar button", () => {
    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Зафиксировать сетку" }));
    expect(setStatusMutate).toHaveBeenCalledWith("ready");
  });

  it("shows the server error when fixation is rejected (fewer than two seeded)", () => {
    setStatusError = new Error("not enough seeded fighters to lock the bracket");
    render(<BracketSeeding stageId="stage-1" />);
    expect(
      screen.getByText("not enough seeded fighters to lock the bracket"),
    ).toBeInTheDocument();
  });

  // Спека 0023, FR-8/AC-7: сброс посева идёт через ConfirmDialog
  // дизайн-системы, а не системный window.confirm.
  it("opens ConfirmDialog instead of window.confirm on reset click", () => {
    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сбросить посев/i }));

    expect(screen.getByText("Сбросить посев?")).toBeInTheDocument();
    expect(screen.getByText("Все слоты будут очищены.")).toBeInTheDocument();
    expect(resetMutate).not.toHaveBeenCalled();
  });

  it("cancelling the dialog does not call resetBracket.mutate", () => {
    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сбросить посев/i }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(resetMutate).not.toHaveBeenCalled();
  });

  // Спека 0023, FR-8: успех — toastUndo с «Отменить» поверх существующего undo.
  it("confirming reset calls mutate and shows an undo toast on success", () => {
    resetMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options.onSuccess?.();
    });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сбросить посев/i }));
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));

    expect(resetMutate).toHaveBeenCalledTimes(1);
    expect(toastUndoMock).toHaveBeenCalledTimes(1);
    expect(toastUndoMock.mock.calls[0][0]).toBe("Посев сброшен");

    toastUndoMock.mock.calls[0][1].onUndo();
    expect(undoMutate).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable error toast when reset fails", () => {
    resetMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options.onError?.(new Error("сеть недоступна"));
    });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сбросить посев/i }));
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toBe("сеть недоступна");
    expect(toastErrorMock.mock.calls[0][1]?.retry).toBeTypeOf("function");
  });

  it("renders the read-only bracket view after fixation, with Undo gated by canUndo", () => {
    bracketData = readyBracket(false);
    render(<BracketSeeding stageId="stage-1" />);

    expect(screen.queryByText("Нераспределённые")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вернуть в черновик" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Отменить/i })).toBeDisabled();
  });

  it("enables Undo after fixation when canUndo is true, and calls the mutation", () => {
    bracketData = readyBracket(true);
    render(<BracketSeeding stageId="stage-1" />);

    const undoButton = screen.getByRole("button", { name: /Отменить/i });
    expect(undoButton).toBeEnabled();
    fireEvent.click(undoButton);
    expect(undoMutate).toHaveBeenCalled();
  });

  it("toggles back to draft from the read-only view", () => {
    bracketData = readyBracket(false);
    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Вернуть в черновик" }));
    expect(setStatusMutate).toHaveBeenCalledWith("draft");
  });
});
