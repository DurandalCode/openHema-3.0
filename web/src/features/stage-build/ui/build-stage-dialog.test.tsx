// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildStageDialog } from "./build-stage-dialog";
import type { Stage, StageBuildPreview } from "@/entities/stage/lib/types";

const bracketStage: Stage = {
  id: "b1",
  nominationId: "n1",
  position: 1,
  title: "Плейофф за 1-е место",
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 8, thirdPlace: false },
  groups: null,
  rule: {
    sourceKind: "STAGE_SOURCE_KIND_STAGE",
    sourceStageId: "g1",
    selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
    placeFrom: 1,
    placeTo: 2,
    method: "STAGE_LAYOUT_METHOD_SEEDED",
  },
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
};

const groupsStage: Stage = {
  ...bracketStage,
  id: "gr1",
  type: "STAGE_TYPE_GROUPS",
  bracket: null,
  groups: { groupCount: 2 },
};

function fighter(id: string, name: string, club = "") {
  return { fighterId: id, name, club };
}

function emptyPreview(overrides: Partial<StageBuildPreview> = {}): StageBuildPreview {
  return {
    entries: [],
    unselected: [],
    capacity: 8,
    ties: [],
    overlaps: [],
    sourceUnfinishedBouts: 0,
    ...overrides,
  };
}

let previewData: StageBuildPreview | undefined;
let previewError: Error | null = null;
let previewPending = false;
const previewMutate = vi.fn();
const previewReset = vi.fn();

vi.mock("../api/use-build-preview", () => ({
  useBuildPreview: () => ({
    data: previewData,
    error: previewError,
    isPending: previewPending,
    mutate: previewMutate,
    reset: previewReset,
  }),
}));

let buildError: Error | null = null;
let buildPending = false;
const buildMutate = vi.fn((_ties: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
const buildReset = vi.fn();

vi.mock("../api/use-build-stage", () => ({
  useBuildStage: () => ({
    error: buildError,
    isPending: buildPending,
    mutate: buildMutate,
    reset: buildReset,
  }),
}));

function openDialog(stage: Stage = bracketStage) {
  render(<BuildStageDialog stage={stage} />);
  fireEvent.click(screen.getByRole("button", { name: "Формирование" }));
}

describe("BuildStageDialog", () => {
  beforeEach(() => {
    previewData = undefined;
    previewError = null;
    previewPending = false;
    buildError = null;
    buildPending = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("requests a preview with empty ties as soon as the dialog opens", () => {
    openDialog();
    expect(previewMutate).toHaveBeenCalledWith([]);
  });

  it("renders each entry with its originLabel and target slot for a bracket stage (FR-27)", () => {
    previewData = emptyPreview({
      entries: [
        {
          fighter: fighter("f1", "Иванов"),
          originLabel: "Группа 2, место 1",
          sourcePlace: 1,
          overallPlace: 1,
          targetPoolNumber: 0,
          targetSlot: 3,
        },
      ],
    });
    openDialog(bracketStage);

    expect(screen.getByText("Иванов")).toBeInTheDocument();
    expect(screen.getByText("Группа 2, место 1")).toBeInTheDocument();
    expect(screen.getByText("Слот 3")).toBeInTheDocument();
  });

  it("renders the target pool number for a groups stage instead of a slot", () => {
    previewData = emptyPreview({
      entries: [
        {
          fighter: fighter("f1", "Иванов"),
          originLabel: "Ростер номинации",
          sourcePlace: 0,
          overallPlace: 0,
          targetPoolNumber: 2,
          targetSlot: 0,
        },
      ],
    });
    openDialog(groupsStage);

    expect(screen.getByText("Группа 2")).toBeInTheDocument();
    expect(screen.queryByText(/Слот/)).not.toBeInTheDocument();
  });

  it("shows a non-blocking warning when the source has unfinished bouts (FR-14)", () => {
    previewData = emptyPreview({ sourceUnfinishedBouts: 3 });
    openDialog();

    expect(screen.getByTestId("unfinished-warning")).toHaveTextContent("3 незавершённых");
    expect(screen.getByRole("button", { name: "Сформировать" })).toBeEnabled();
  });

  it("blocks formation and explains which fighters overlap when overlaps is non-empty (FR-11)", () => {
    previewData = emptyPreview({ overlaps: [fighter("f9", "Петров")] });
    openDialog();

    expect(screen.getByTestId("overlaps-warning")).toHaveTextContent("Петров");
    expect(screen.getByRole("button", { name: "Сформировать" })).toBeDisabled();
  });

  it("disables 'Сформировать' while unresolved ties remain, even without overlaps", () => {
    previewData = emptyPreview({
      ties: [
        {
          sourcePoolId: "p1",
          groupLabel: "Группа 1",
          place: 2,
          contenders: [fighter("f1", "A"), fighter("f2", "B")],
          slotsLeft: 1,
        },
      ],
    });
    openDialog();

    expect(screen.getByRole("button", { name: "Сформировать" })).toBeDisabled();
    expect(screen.getByTestId("build-ties")).toBeInTheDocument();
  });

  it("lets the organizer pick passage order by clicking contenders, and enables the refresh button once resolved (FR-22)", () => {
    previewData = emptyPreview({
      ties: [
        {
          sourcePoolId: "p1",
          groupLabel: "Группа 1",
          place: 2,
          contenders: [fighter("f1", "A"), fighter("f2", "B"), fighter("f3", "C")],
          slotsLeft: 1,
        },
      ],
    });
    openDialog();

    const refreshButton = screen.getByRole("button", { name: "Обновить превью с ответами" });
    expect(refreshButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(refreshButton).toBeEnabled();

    fireEvent.click(refreshButton);
    expect(previewMutate).toHaveBeenLastCalledWith([
      { sourcePoolId: "p1", place: 2, fighterIds: ["f1"] },
    ]);
  });

  it("calls buildStage with the accumulated ties and closes the dialog on success", () => {
    previewData = emptyPreview({
      entries: [
        {
          fighter: fighter("f1", "Иванов"),
          originLabel: "Группа 1, место 1",
          sourcePlace: 1,
          overallPlace: 1,
          targetPoolNumber: 0,
          targetSlot: 1,
        },
      ],
    });
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Сформировать" }));

    expect(buildMutate).toHaveBeenCalledWith([], expect.anything());
    expect(screen.queryByText("Формирование этапа «Плейофф за 1-е место»")).not.toBeInTheDocument();
  });

  it("shows the server error when build is rejected (e.g. ErrStageNotEmpty)", () => {
    previewData = emptyPreview();
    buildError = new Error("stage composition is not empty");
    openDialog();

    expect(screen.getByText("stage composition is not empty")).toBeInTheDocument();
  });

  it("shows the server error when preview fails", () => {
    previewError = new Error("stage not found");
    openDialog();

    expect(screen.getByText("stage not found")).toBeInTheDocument();
  });

  it("never renders a literal requirement ID in user-facing copy (FR-16)", () => {
    previewData = emptyPreview({
      overlaps: [fighter("f9", "Петров")],
      sourceUnfinishedBouts: 2,
      ties: [
        {
          sourcePoolId: "p1",
          groupLabel: "Группа 1",
          place: 2,
          contenders: [fighter("f1", "A"), fighter("f2", "B")],
          slotsLeft: 1,
        },
      ],
    });
    openDialog();

    expect(document.body.textContent).not.toMatch(/FR-\d+/);
  });

  describe("build gate explanation (AC-8/AC-9/AC-10)", () => {
    it("shows 'пока есть пересечение веток' next to the disabled button when overlaps are present", () => {
      previewData = emptyPreview({ overlaps: [fighter("f9", "Петров")] });
      openDialog();

      expect(screen.getByRole("button", { name: "Сформировать" })).toBeDisabled();
      expect(screen.getByText("пока есть пересечение веток")).toBeInTheDocument();
    });

    it("shows 'пока есть неразрешённые дележи' next to the disabled button when ties are unresolved", () => {
      previewData = emptyPreview({
        ties: [
          {
            sourcePoolId: "p1",
            groupLabel: "Группа 1",
            place: 2,
            contenders: [fighter("f1", "A"), fighter("f2", "B")],
            slotsLeft: 1,
          },
        ],
      });
      openDialog();

      expect(screen.getByRole("button", { name: "Сформировать" })).toBeDisabled();
      expect(screen.getByText("пока есть неразрешённые дележи")).toBeInTheDocument();
    });

    it("shows no blocking explanation and keeps the button enabled with only an unfinished source (AC-10)", () => {
      previewData = emptyPreview({ sourceUnfinishedBouts: 3 });
      openDialog();

      expect(screen.getByRole("button", { name: "Сформировать" })).toBeEnabled();
      expect(screen.queryByText("пока есть пересечение веток")).not.toBeInTheDocument();
      expect(screen.queryByText("пока есть неразрешённые дележи")).not.toBeInTheDocument();
    });
  });

  describe("controlled mode (спека 0032, T6)", () => {
    it("renders no trigger button when `open` prop is passed — the caller opens it programmatically", () => {
      previewData = emptyPreview();
      render(<BuildStageDialog stage={bracketStage} open={false} onOpenChange={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "Формирование" })).not.toBeInTheDocument();
    });

    it("shows dialog content and requests a preview when `open` is true", () => {
      previewData = emptyPreview();
      render(<BuildStageDialog stage={bracketStage} open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Формирование этапа «Плейофф за 1-е место»')).toBeInTheDocument();
      expect(previewMutate).toHaveBeenCalledWith([]);
    });

    it("requests a preview when the `open` prop flips from false to true", () => {
      previewData = emptyPreview();
      const { rerender } = render(
        <BuildStageDialog stage={bracketStage} open={false} onOpenChange={vi.fn()} />,
      );
      expect(previewMutate).not.toHaveBeenCalled();

      rerender(<BuildStageDialog stage={bracketStage} open={true} onOpenChange={vi.fn()} />);
      expect(previewMutate).toHaveBeenCalledWith([]);
    });

    it("calls onOpenChange(false) instead of managing its own open state after a successful build", () => {
      previewData = emptyPreview({
        entries: [
          {
            fighter: fighter("f1", "Иванов"),
            originLabel: "Группа 1, место 1",
            sourcePlace: 1,
            overallPlace: 1,
            targetPoolNumber: 0,
            targetSlot: 1,
          },
        ],
      });
      const onOpenChange = vi.fn();
      render(<BuildStageDialog stage={bracketStage} open={true} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByRole("button", { name: "Сформировать" }));

      expect(buildMutate).toHaveBeenCalledWith([], expect.anything());
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("still renders its own trigger and manages state internally when the `open` prop is omitted (existing caller, out of scope)", () => {
      previewData = emptyPreview();
      render(<BuildStageDialog stage={bracketStage} />);

      expect(screen.getByRole("button", { name: "Формирование" })).toBeInTheDocument();
      expect(screen.queryByText(/Формирование этапа/)).not.toBeInTheDocument();
    });
  });
});
