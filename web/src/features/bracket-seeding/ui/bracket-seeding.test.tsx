// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BracketSeeding } from "./bracket-seeding";
import { bracketErrorMessage } from "../api/errors";
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
      executionStatus: "STAGE_STATUS_UNSPECIFIED",
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
const toastSuccessMock = vi.fn();
const toastUndoMock = vi.fn();
const toastErrorMock = vi.fn();

const useBracketMock = vi.fn();
let capturedOnDragEnd: ((event: unknown) => void) | undefined;

function mockBracketData(bracket: Bracket | undefined, overrides: Partial<{
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}> = {}) {
  useBracketMock.mockReturnValue({
    data: bracket,
    isLoading: overrides.isLoading ?? false,
    error: overrides.error ?? null,
    refetch: overrides.refetch ?? vi.fn(),
  });
}

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    // Реальный DndContext требует настоящих pointer/gesture-событий, которых
    // jsdom не эмулирует (см. `nomination-pools.test.tsx`); тут перехватывается
    // только `onDragEnd`, чтобы вызвать его напрямую синтетическим событием.
    // `useDraggable`/`useDroppable` внутри детей остаются настоящими.
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: unknown) => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
      return children;
    },
  };
});

vi.mock("../api/use-bracket", () => ({
  useBracket: (...args: unknown[]) => useBracketMock(...args),
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
    error: null,
  }),
}));
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (message: string) => toastSuccessMock(message),
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
    capturedOnDragEnd = undefined;
    vi.resetAllMocks();
    mockBracketData(draftBracket());
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
  });

  // Спека 0032, FR-25/AC-14: пустые состояния различимы — пустой список
  // нераспределённых («Пусто») отличается от пустого слота сетки.
  it("differentiates the empty unassigned list from an empty slot", () => {
    mockBracketData({ ...draftBracket(), unassigned: [] });
    render(<BracketSeeding stageId="stage-1" />);

    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getAllByText("Перетащите бойца сюда").length).toBeGreaterThan(0);
  });

  // Спека 0032, FR-21/AC-14: клик по кнопке очистки — мутация с обработчиком
  // ошибки, тост вместо постоянного баннера.
  it("clears a filled slot via its clear button", () => {
    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByLabelText("Освободить слот 1"));

    expect(clearMutate).toHaveBeenCalledWith(1, expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("a failed slot clear shows a translated error toast", () => {
    clearMutate.mockImplementation((_slot, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("bracket: layout is ready, cannot modify"));
    });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByLabelText("Освободить слот 1"));

    expect(toastErrorMock).toHaveBeenCalledWith(
      bracketErrorMessage("bracket: layout is ready, cannot modify"),
      undefined,
    );
  });

  // Спека 0032, FR-21: DnD-посев — тихий успех, тост только на ошибку.
  it("a successful seed drag calls seedSlot without a toast", () => {
    render(<BracketSeeding stageId="stage-1" />);
    capturedOnDragEnd?.({
      active: { data: { current: { fighterId: "b3", fromSlot: null } } },
      over: { data: { current: { slot: 2 } } },
    });

    expect(seedMutate).toHaveBeenCalledWith(
      { fighterId: "b3", slot: 2 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("a failed seed drag shows a translated error toast (slot occupied)", () => {
    seedMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("bracket: slot occupied"));
    });

    render(<BracketSeeding stageId="stage-1" />);
    capturedOnDragEnd?.({
      active: { data: { current: { fighterId: "b3", fromSlot: null } } },
      over: { data: { current: { slot: 2 } } },
    });

    expect(toastErrorMock).toHaveBeenCalledWith(bracketErrorMessage("bracket: slot occupied"), undefined);
  });

  // Спека 0032, FR-3: смена статуса — тост-успех по направлению перехода.
  it("fixing the bracket via the toolbar button shows a success toast", () => {
    setStatusMutate.mockImplementation((_status, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Зафиксировать сетку" }));

    expect(setStatusMutate).toHaveBeenCalledWith(
      "ready",
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Сетка зафиксирована");
  });

  it("a failed status change shows a translated error toast, no permanent banner", () => {
    setStatusMutate.mockImplementation((_status, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("not enough seeded fighters to lock the bracket"));
    });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Зафиксировать сетку" }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      bracketErrorMessage("not enough seeded fighters to lock the bracket"),
      undefined,
    );
    expect(
      screen.queryByText("not enough seeded fighters to lock the bracket"),
    ).not.toBeInTheDocument();
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

  // Спека 0032, FR-22: успех — toastUndo с «Отменить», зовущий тот же undo,
  // что и кнопка тулбара (по образцу nomination-pools, спека 0030).
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

  it("shows a retryable, translated error toast when reset fails", () => {
    resetMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options.onError?.(new Error("сеть недоступна"));
    });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сбросить посев/i }));
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toBe(bracketErrorMessage("сеть недоступна"));
    expect(toastErrorMock.mock.calls[0][1]?.retry).toBeTypeOf("function");
  });

  it("renders the read-only bracket view after fixation, with Undo gated by canUndo", () => {
    mockBracketData(readyBracket(false));
    render(<BracketSeeding stageId="stage-1" />);

    expect(screen.queryByText("Нераспределённые")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вернуть в черновик" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Отменить/i })).toBeDisabled();
  });

  it("enables Undo after fixation when canUndo is true, and calls the mutation silently on success", () => {
    mockBracketData(readyBracket(true));
    render(<BracketSeeding stageId="stage-1" />);

    const undoButton = screen.getByRole("button", { name: /Отменить/i });
    expect(undoButton).toBeEnabled();
    fireEvent.click(undoButton);

    expect(undoMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("a failed toolbar Отменить shows a translated error toast", () => {
    mockBracketData(readyBracket(true));
    undoMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("nothing to undo"));
    });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Отменить/i }));

    expect(toastErrorMock).toHaveBeenCalledWith(bracketErrorMessage("nothing to undo"), undefined);
  });

  it("toggling back to draft shows its own success toast", () => {
    mockBracketData(readyBracket(false));
    setStatusMutate.mockImplementation((_status, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Вернуть в черновик" }));

    expect(setStatusMutate).toHaveBeenCalledWith(
      "draft",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Сетка возвращена в черновик");
  });

  // Спека 0032, FR-23: скелетон в форме экрана (нераспределённые + пары),
  // а не общие карточки-заглушки.
  it("shows a screen-shaped skeleton (not the generic SkeletonCards) while loading", () => {
    mockBracketData(undefined, { isLoading: true });

    render(<BracketSeeding stageId="stage-1" />);

    expect(screen.queryByText("Загрузка…")).not.toBeInTheDocument();
    expect(screen.getByTestId("bracket-seeding-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-cards")).not.toBeInTheDocument();
  });

  // Спека 0032, FR-24: ошибка загрузки — сообщение с кнопкой «Повторить».
  it("shows a retry button on load error that calls refetch", () => {
    const refetch = vi.fn();
    mockBracketData(undefined, { isLoading: false, error: new Error("boom"), refetch });

    render(<BracketSeeding stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
