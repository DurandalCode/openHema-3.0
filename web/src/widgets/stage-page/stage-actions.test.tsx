// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StageActions } from "./stage-actions";
import type { Stage } from "@/entities/stage/lib/types";
import { poolsErrorMessage } from "@/features/nomination-pools/api/errors";

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов (см. `shared/ui/dialog.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

const ruledGroupStage: Stage = {
  id: "s1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: null,
  groups: { groupCount: 4 },
  rule: {
    sourceKind: "STAGE_SOURCE_KIND_ROSTER",
    sourceStageId: "",
    selector: "STAGE_SELECTOR_KIND_ALL",
    placeFrom: 0,
    placeTo: 0,
    method: "STAGE_LAYOUT_METHOD_SNAKE",
  },
  executionStatus: "STAGE_STATUS_DRAFT",
};

const bracketStage: Stage = {
  ...ruledGroupStage,
  id: "s2",
  type: "STAGE_TYPE_BRACKET",
  bracket: { size: 8, thirdPlace: false },
  groups: null,
};

const resetLayoutMutate = vi.fn();
const undoLayoutMutate = vi.fn();
const resetBracketMutate = vi.fn();
const undoBracketMutate = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/features/nomination-pools/api/use-reset-layout", () => ({
  useResetLayout: () => ({ mutate: resetLayoutMutate, isPending: false, error: null }),
}));
vi.mock("@/features/nomination-pools/api/use-undo", () => ({
  useUndo: () => ({ mutate: undoLayoutMutate, isPending: false, error: null }),
}));
vi.mock("@/features/bracket-seeding/api/use-reset-bracket", () => ({
  useResetBracket: () => ({ mutate: resetBracketMutate, isPending: false, error: null }),
}));
vi.mock("@/features/bracket-seeding/api/use-undo-bracket", () => ({
  useUndoBracket: () => ({ mutate: undoBracketMutate, isPending: false, error: null }),
}));
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (message: string) => toastSuccessMock(message),
  toastError: (message: string, options?: { retry?: () => void }) => toastErrorMock(message, options),
}));
vi.mock("@/features/stage-build/ui/build-stage-dialog", () => ({
  BuildStageDialog: ({
    stage,
    open,
  }: {
    stage: Stage;
    open?: boolean;
    onOpenChange?: (next: boolean) => void;
  }) => (open ? <div data-testid="build-dialog-open">Формирование этапа «{stage.title}»</div> : null),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StageActions", () => {
  // Спека 0032, AC-4: «Сформировать» открывает окно превью формирования.
  it("opens the build preview dialog when 'Сформировать' is clicked (AC-4)", () => {
    render(<StageActions stage={ruledGroupStage} filled={0} canUndo={false} />);

    expect(screen.queryByTestId("build-dialog-open")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сформировать" }));

    expect(screen.getByTestId("build-dialog-open")).toBeInTheDocument();
  });

  // Спека 0032, AC-5: непустой состав блокирует формирование с объяснением;
  // мутация не уходит вовсе (кнопки открытия диалога нет).
  it("blocks re-forming with an explanation when composition is not empty (AC-5)", () => {
    render(<StageActions stage={ruledGroupStage} filled={4} canUndo={false} />);

    const button = screen.getByRole("button", { name: "Сформировать заново" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/сначала сбросьте состав этапа/i)).toBeInTheDocument();
    expect(screen.queryByTestId("build-dialog-open")).not.toBeInTheDocument();
  });

  it("does not render any build action for a stage without a rule", () => {
    const noRuleStage: Stage = { ...ruledGroupStage, rule: null };
    render(<StageActions stage={noRuleStage} filled={0} canUndo={false} />);

    expect(screen.queryByRole("button", { name: "Сформировать" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сформировать заново" })).not.toBeInTheDocument();
  });

  // Спека 0032, AC-6: успешный сброс — тост-успех, состав очищен.
  it("resets a group stage's layout via ConfirmDialog and shows a success toast (AC-6)", () => {
    resetLayoutMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<StageActions stage={ruledGroupStage} filled={4} canUndo={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Сбросить этап" }));
    expect(resetLayoutMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Да, сбросить/i }));

    expect(resetLayoutMutate).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Состав этапа сброшен");
  });

  it("resets a bracket stage's seeding via useResetBracket, not useResetLayout", () => {
    resetBracketMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<StageActions stage={bracketStage} filled={4} canUndo={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Сбросить этап" }));
    fireEvent.click(screen.getByRole("button", { name: /Да, сбросить/i }));

    expect(resetBracketMutate).toHaveBeenCalledTimes(1);
    expect(resetLayoutMutate).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("Состав этапа сброшен");
  });

  // Спека 0032, AC-6: отказ сервера (бой уже завершён) — тост-ошибка
  // по-русски, состав остаётся на месте (компонент не пробует оптимистично
  // ничего менять). Перевод делает сам хук (`mutationFn`, по HTTP-статусу),
  // поэтому виджет обязан показать `err.message` как есть: перевести его
  // повторно значит потерять конкретику и выдать generic-текст.
  it("shows the hook's Russian error toast verbatim when the server rejects reset", () => {
    const translated = poolsErrorMessage("bout already finished", 409);
    resetLayoutMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error(translated));
    });

    render(<StageActions stage={ruledGroupStage} filled={4} canUndo={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Сбросить этап" }));
    fireEvent.click(screen.getByRole("button", { name: /Да, сбросить/i }));

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toBe(translated);
    expect(toastErrorMock.mock.calls[0][0]).not.toMatch(/bout already finished/);
    expect(screen.queryByText("bout already finished")).not.toBeInTheDocument();
  });

  // Спека 0032, AC-7: «Отменить последнее действие».
  it("calls the group undo mutation when 'Отменить последнее действие' is clicked (AC-7)", () => {
    render(<StageActions stage={ruledGroupStage} filled={4} canUndo />);

    fireEvent.click(screen.getByRole("button", { name: "Отменить последнее действие" }));

    expect(undoLayoutMutate).toHaveBeenCalledTimes(1);
    expect(undoBracketMutate).not.toHaveBeenCalled();
  });

  it("calls the bracket undo mutation for a bracket stage", () => {
    render(<StageActions stage={bracketStage} filled={4} canUndo />);

    fireEvent.click(screen.getByRole("button", { name: "Отменить последнее действие" }));

    expect(undoBracketMutate).toHaveBeenCalledTimes(1);
    expect(undoLayoutMutate).not.toHaveBeenCalled();
  });

  it("disables undo when canUndo is false", () => {
    render(<StageActions stage={ruledGroupStage} filled={4} canUndo={false} />);

    expect(screen.getByRole("button", { name: "Отменить последнее действие" })).toBeDisabled();
  });
});
