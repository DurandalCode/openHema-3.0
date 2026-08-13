// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StageManagement } from "./stage-management";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";

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

const groupsStage: Stage = {
  id: "s1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_READY",
  bracket: null,
  groups: null,
  rule: null,
};

const bracketStage: Stage = {
  id: "s2",
  nominationId: "n1",
  position: 1,
  title: "Плейофф",
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 8, thirdPlace: true },
  groups: null,
  rule: null,
};

const ruledBracketStage: Stage = {
  id: "s3",
  nominationId: "n1",
  position: 1,
  title: "Утешительная сетка",
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 4, thirdPlace: false },
  groups: null,
  rule: {
    sourceKind: "STAGE_SOURCE_KIND_STAGE",
    sourceStageId: "s1",
    selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
    placeFrom: 3,
    placeTo: 0,
    method: "STAGE_LAYOUT_METHOD_SEEDED",
  },
};

const explicitGroupsStage: Stage = {
  id: "s4",
  nominationId: "n1",
  position: 0,
  title: "Слабые",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: null,
  groups: { groupCount: 2 },
  rule: null,
};

const deleteMutate = vi.fn();
const createMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
const resetLayoutMutate = vi.fn();
const resetBracketMutate = vi.fn();
const undoLayoutMutate = vi.fn();
const undoBracketMutate = vi.fn();
const toastUndoMock = vi.fn();
const toastErrorMock = vi.fn();
let stagesData: Stage[] = [groupsStage, bracketStage];
let issuesData: SchemaIssue[] = [];
let deleteError: Error | null = null;
let createError: Error | null = null;

vi.mock("../api/use-stages", () => ({
  useStages: () => ({
    data: { stages: stagesData, issues: issuesData },
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../api/use-delete-stage", () => ({
  useDeleteStage: () => ({ mutate: deleteMutate, isPending: false, error: deleteError }),
}));
vi.mock("../api/use-create-stage", () => ({
  useCreateStage: () => ({
    mutate: createMutate,
    isPending: false,
    error: createError,
    reset: vi.fn(),
  }),
}));
vi.mock("@/features/nomination-pools/api/use-reset-layout", () => ({
  useResetLayout: () => ({ mutate: resetLayoutMutate, isPending: false, error: null }),
}));
vi.mock("@/features/bracket-seeding/api/use-reset-bracket", () => ({
  useResetBracket: () => ({ mutate: resetBracketMutate, isPending: false, error: null }),
}));
vi.mock("@/features/nomination-pools/api/use-undo", () => ({
  useUndo: () => ({ mutate: undoLayoutMutate, isPending: false, error: null }),
}));
vi.mock("@/features/bracket-seeding/api/use-undo-bracket", () => ({
  useUndoBracket: () => ({ mutate: undoBracketMutate, isPending: false, error: null }),
}));
vi.mock("@/shared/lib/toast", () => ({
  toastUndo: (message: string, options: { onUndo: () => void }) => toastUndoMock(message, options),
  toastError: (message: string, options?: { retry?: () => void }) => toastErrorMock(message, options),
}));
vi.mock("@/features/stage-build/ui/build-stage-dialog", () => ({
  BuildStageDialog: ({ stage }: { stage: Stage }) => (
    <button type="button">Сформировать: {stage.title}</button>
  ),
}));
vi.mock("./edit-stage-dialog", () => ({
  EditStageDialog: ({ stage }: { stage: Stage; composeEmpty: boolean }) => (
    <button type="button" aria-label={`Изменить этап «${stage.title}»`}>
      Изменить: {stage.title}
    </button>
  ),
}));
vi.mock("@/features/format-presets/ui/apply-format-dialog", () => ({
  ApplyFormatDialog: () => <button type="button">Применить формат</button>,
}));
vi.mock("@/features/format-presets/ui/save-preset-dialog", () => ({
  SavePresetDialog: () => <button type="button">Сохранить как пресет</button>,
}));

describe("StageManagement", () => {
  beforeEach(() => {
    stagesData = [groupsStage, bracketStage];
    issuesData = [];
    deleteError = null;
    createError = null;
    vi.clearAllMocks();
    resetLayoutMutate.mockReset();
    resetBracketMutate.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders stage cards with title, type and status", () => {
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.getByText("Плейофф")).toBeInTheDocument();
    expect(screen.getByText("группы")).toBeInTheDocument();
    expect(screen.getByText("сетка")).toBeInTheDocument();
  });

  it("shows a delete button for every stage, including the auto-stage (спека 0020, FR-5)", () => {
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByLabelText("Удалить Групповой этап")).toBeInTheDocument();
    expect(screen.getByLabelText("Удалить Плейофф")).toBeInTheDocument();
  });

  it("shows a delete button for an explicitly created groups stage (0019, FR-7a)", () => {
    stagesData = [groupsStage, explicitGroupsStage];
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByLabelText("Удалить Слабые")).toBeInTheDocument();
  });

  it("shows an edit button for every stage (спека 0020, FR-2)", () => {
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByText("Изменить: Групповой этап")).toBeInTheDocument();
    expect(screen.getByText("Изменить: Плейофф")).toBeInTheDocument();
  });

  it("renders schema-level actions: save as preset and apply format", () => {
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByText("Сохранить как пресет")).toBeInTheDocument();
    expect(screen.getByText("Применить формат")).toBeInTheDocument();
  });

  it("passes diagnostics through to the schema widget (спека 0020, FR-8)", () => {
    issuesData = [
      {
        severity: "SCHEMA_ISSUE_SEVERITY_ERROR",
        code: "SCHEMA_ISSUE_CODE_SELECTOR_OVERLAP",
        stageIds: ["s2"],
        message: "Ветки пересекаются по месту 2",
      },
    ];
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByText("Ветки пересекаются по месту 2")).toBeInTheDocument();
  });

  it("deleting the bracket stage calls the mutation with its id", () => {
    render(<StageManagement nominationId="n1" />);
    fireEvent.click(screen.getByLabelText("Удалить Плейофф"));
    expect(deleteMutate).toHaveBeenCalledWith("s2");
  });

  it("shows the server error when deletion is rejected", () => {
    deleteError = new Error("stage is not deletable");
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByText("stage is not deletable")).toBeInTheDocument();
  });

  it("does not show build/reset actions for a stage without a rule", () => {
    render(<StageManagement nominationId="n1" />);
    expect(screen.queryByText("Сформировать: Плейофф")).not.toBeInTheDocument();
    expect(screen.queryByText("Расформировать")).not.toBeInTheDocument();
  });

  it("shows build/reset quick actions for a stage with a seeding rule (0019, FR-13/FR-17)", () => {
    stagesData = [groupsStage, ruledBracketStage];
    render(<StageManagement nominationId="n1" />);
    expect(screen.getByText("Сформировать: Утешительная сетка")).toBeInTheDocument();
    expect(screen.getByText("Расформировать")).toBeInTheDocument();
  });

  // Спека 0023, T28-finding: найдено при ручном смоуке — эта кнопка звала
  // мутацию напрямую, без единого подтверждения (не было даже
  // window.confirm). Теперь — тот же ConfirmDialog, что у «Сбросить
  // раскладку»/«Сбросить посев» (FR-7/FR-8).
  it("opens ConfirmDialog instead of calling the mutation directly", () => {
    stagesData = [groupsStage, ruledBracketStage];
    render(<StageManagement nominationId="n1" />);
    fireEvent.click(screen.getByText("Расформировать"));

    expect(screen.getByText("Расформировать «Утешительная сетка»?")).toBeInTheDocument();
    expect(screen.getByText("Все слоты будут очищены.")).toBeInTheDocument();
    expect(resetBracketMutate).not.toHaveBeenCalled();
  });

  it("cancelling the dialog does not call the mutation", () => {
    stagesData = [groupsStage, ruledBracketStage];
    render(<StageManagement nominationId="n1" />);
    fireEvent.click(screen.getByText("Расформировать"));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(resetBracketMutate).not.toHaveBeenCalled();
  });

  it("confirming reset calls useResetBracket, not useResetLayout, and shows an undo toast", () => {
    resetBracketMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options.onSuccess?.();
    });
    stagesData = [groupsStage, ruledBracketStage];
    render(<StageManagement nominationId="n1" />);
    fireEvent.click(screen.getByText("Расформировать"));
    fireEvent.click(screen.getByRole("button", { name: "Да, расформировать" }));

    expect(resetBracketMutate).toHaveBeenCalledTimes(1);
    expect(resetLayoutMutate).not.toHaveBeenCalled();
    expect(toastUndoMock).toHaveBeenCalledTimes(1);
    expect(toastUndoMock.mock.calls[0][0]).toBe("Посев сброшен");

    toastUndoMock.mock.calls[0][1].onUndo();
    expect(undoBracketMutate).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable error toast when reset fails", () => {
    resetBracketMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options.onError?.(new Error("сеть недоступна"));
    });
    stagesData = [groupsStage, ruledBracketStage];
    render(<StageManagement nominationId="n1" />);
    fireEvent.click(screen.getByText("Расформировать"));
    fireEvent.click(screen.getByRole("button", { name: "Да, расформировать" }));

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toBe("сеть недоступна");
    expect(toastErrorMock.mock.calls[0][1]?.retry).toBeTypeOf("function");
  });

  it("creating a stage opens the dialog and submits the form with default size 8", () => {
    render(<StageManagement nominationId="n1" />);

    fireEvent.click(screen.getByRole("button", { name: /Добавить этап/i }));
    const titleInput = screen.getByLabelText("Название");
    fireEvent.change(titleInput, { target: { value: "Плейофф 16" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Бой за 3-е место" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    expect(createMutate).toHaveBeenCalledWith(
      { type: "bracket", title: "Плейофф 16", bracketSize: 8, thirdPlace: true },
      expect.anything(),
    );
  });

  it("shows the server error when creation is rejected", () => {
    createError = new Error("bracket size must be a power of two");
    render(<StageManagement nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /Добавить этап/i }));
    expect(screen.getByText("bracket size must be a power of two")).toBeInTheDocument();
  });
});
