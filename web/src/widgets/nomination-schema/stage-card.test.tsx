// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StageCard } from "./stage-card";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";

/**
 * Radix `Dialog`/`ConfirmDialog` в jsdom нуждаются в тех же полифиллах, что
 * `stage-management.test.tsx` (см. `shared/ui/dialog.test.tsx`).
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
  groups: { groupCount: 4 },
  rule: null,
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
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
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
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
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
};

const resetLayoutMutate = vi.fn();
const resetBracketMutate = vi.fn();
const undoLayoutMutate = vi.fn();
const undoBracketMutate = vi.fn();
const toastUndoMock = vi.fn();
const toastErrorMock = vi.fn();

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

function renderCard(
  stage: Stage,
  overrides: Partial<{
    stages: Stage[];
    issues: SchemaIssue[];
    onInspect: (stage: Stage) => void;
    onDelete: (stage: Stage) => void;
  }> = {},
) {
  const onInspect = overrides.onInspect ?? vi.fn();
  const onDelete = overrides.onDelete ?? vi.fn();
  render(
    <StageCard
      stage={stage}
      stages={overrides.stages ?? [groupsStage, bracketStage]}
      nominationId="n1"
      issues={overrides.issues ?? []}
      onInspect={onInspect}
      onDelete={onDelete}
    />,
  );
  return { onInspect, onDelete };
}

describe("StageCard (спека 0031, T11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows title, type label and status", () => {
    renderCard(groupsStage);
    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.getByText("группы")).toBeInTheDocument();
    expect(screen.getByText("готово")).toBeInTheDocument();
  });

  it("shows config summary on the card (AC-5: '4 гр.')", () => {
    renderCard(groupsStage);
    expect(screen.getByText("4 гр.")).toBeInTheDocument();
  });

  it("shows config summary for a bracket with third place (AC-5: '8 · бронза')", () => {
    renderCard(bracketStage);
    expect(screen.getByText("8 · бронза")).toBeInTheDocument();
  });

  it("shows 'Правила нет — набирается руками' when the stage has no rule", () => {
    renderCard(bracketStage);
    expect(screen.getByText("Правила нет — набирается руками")).toBeInTheDocument();
  });

  it("shows the rule label when the stage has a rule", () => {
    renderCard(ruledBracketStage, { stages: [groupsStage, ruledBracketStage] });
    expect(
      screen.getByText("Места 3 и ниже каждой группы · Групповой этап"),
    ).toBeInTheDocument();
  });

  it("shows problem messages for this stage only (FR-7)", () => {
    const issues: SchemaIssue[] = [
      {
        severity: "SCHEMA_ISSUE_SEVERITY_ERROR",
        code: "SCHEMA_ISSUE_CODE_SOURCE_CYCLE",
        stageIds: ["s2"],
        message: "Ошибка на плейофф",
      },
      {
        severity: "SCHEMA_ISSUE_SEVERITY_WARNING",
        code: "SCHEMA_ISSUE_CODE_COVERAGE_GAP",
        stageIds: ["s1"],
        message: "Ошибка на группах",
      },
    ];
    renderCard(bracketStage, { issues });
    expect(screen.getByText("Ошибка на плейофф")).toBeInTheDocument();
    expect(screen.queryByText("Ошибка на группах")).not.toBeInTheDocument();
  });

  it("has a 'Посев →' link to the stage page (AC-6)", () => {
    renderCard(groupsStage);
    const link = screen.getByRole("link", { name: /Посев/ });
    expect(link).toHaveAttribute("href", "/admin/nominations/n1/stages/s1");
  });

  it("calls onInspect when 'Настроить' is clicked", () => {
    const { onInspect } = renderCard(groupsStage);
    fireEvent.click(screen.getByRole("button", { name: "Настроить" }));
    expect(onInspect).toHaveBeenCalledWith(groupsStage);
  });

  it("calls onDelete when 'Удалить' is clicked", () => {
    const { onDelete } = renderCard(groupsStage);
    fireEvent.click(screen.getByRole("button", { name: /Удалить/ }));
    expect(onDelete).toHaveBeenCalledWith(groupsStage);
  });

  it("does not show build/reset quick actions for a stage without a rule (FR-11)", () => {
    renderCard(bracketStage);
    expect(screen.queryByText("Сформировать: Плейофф")).not.toBeInTheDocument();
    expect(screen.queryByText("Расформировать")).not.toBeInTheDocument();
  });

  it("shows build/reset quick actions for a stage with a rule (FR-11)", () => {
    renderCard(ruledBracketStage, { stages: [groupsStage, ruledBracketStage] });
    expect(screen.getByText("Сформировать: Утешительная сетка")).toBeInTheDocument();
    expect(screen.getByText("Расформировать")).toBeInTheDocument();
  });

  it("resetting a ruled bracket stage opens a ConfirmDialog before calling the mutation", () => {
    renderCard(ruledBracketStage, { stages: [groupsStage, ruledBracketStage] });
    fireEvent.click(screen.getByText("Расформировать"));
    expect(screen.getByText("Расформировать «Утешительная сетка»?")).toBeInTheDocument();
    expect(resetBracketMutate).not.toHaveBeenCalled();
  });

  it("confirming reset calls useResetBracket and shows an undo toast", () => {
    resetBracketMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options.onSuccess?.();
    });
    renderCard(ruledBracketStage, { stages: [groupsStage, ruledBracketStage] });
    fireEvent.click(screen.getByText("Расформировать"));
    fireEvent.click(screen.getByRole("button", { name: "Да, расформировать" }));

    expect(resetBracketMutate).toHaveBeenCalledTimes(1);
    expect(toastUndoMock).toHaveBeenCalledTimes(1);
  });
});
