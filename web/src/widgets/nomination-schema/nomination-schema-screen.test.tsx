// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";
import { NominationSchemaScreen } from "./nomination-schema-screen";
import { UnauthorizedError } from "@/shared/api/unauthorized";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

function nomination(overrides: Partial<Nomination> = {}): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Длинный меч",
    description: "",
    fighterCapacity: 32,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const groupsStage: Stage = {
  id: "s1",
  nominationId: "n1",
  position: 0,
  title: "Группы",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_DRAFT",
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
  rule: {
    sourceKind: "STAGE_SOURCE_KIND_STAGE",
    sourceStageId: "s1",
    selector: "STAGE_SELECTOR_KIND_ALL",
    placeFrom: 0,
    placeTo: 0,
    method: "STAGE_LAYOUT_METHOD_SEEDED",
  },
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
};

let stagesState: { data: { stages: Stage[]; issues: SchemaIssue[] } | undefined; isLoading: boolean; error: Error | null } = {
  data: { stages: [groupsStage, bracketStage], issues: [] },
  isLoading: false,
  error: null,
};
const stagesRefetch = vi.fn();
vi.mock("@/features/stage-management/api/use-stages", () => ({
  useStages: () => ({ ...stagesState, refetch: stagesRefetch }),
}));

const setRuleMutate = vi.fn();
vi.mock("@/features/stage-management/api/use-set-stage-rule", () => ({
  useSetStageRule: () => ({ mutate: setRuleMutate, isPending: false }),
}));

const deleteStageMutate = vi.fn();
vi.mock("@/features/stage-management/api/use-delete-stage", () => ({
  useDeleteStage: () => ({ mutate: deleteStageMutate, isPending: false }),
}));

vi.mock("@/features/nomination-management/api/use-nomination", () => ({
  useNomination: (_id: string, initialData: Nomination) => ({ data: initialData }),
}));

vi.mock("@/features/nomination-management/ui/nomination-inline-header", () => ({
  NominationInlineHeader: () => <div data-testid="nomination-inline-header" />,
}));

vi.mock("@/features/format-presets/ui/preset-chips", () => ({
  PresetChips: () => <div data-testid="preset-chips" />,
}));

vi.mock("./schema-diagnostics", () => ({
  SchemaDiagnostics: () => <div data-testid="schema-diagnostics" />,
}));

vi.mock("./schema-palette", () => ({
  SchemaPalette: () => <div data-testid="schema-palette" />,
}));

vi.mock("./schema-skeleton", () => ({
  SchemaSkeleton: () => <div data-testid="schema-skeleton" />,
}));

let capturedInspectorProps: { stage: Stage; onClose: () => void } | undefined;
vi.mock("./stage-inspector", () => ({
  StageInspector: (props: { stage: Stage; onClose: () => void }) => {
    capturedInspectorProps = props;
    return <div data-testid="stage-inspector">{props.stage.title}</div>;
  },
}));

let capturedCreateDialogProps:
  | { open: boolean; prefill?: { type: string; sourceStageId?: string } }
  | undefined;
vi.mock("@/features/stage-management/ui/create-stage-dialog", () => ({
  CreateStageDialog: (props: { open: boolean; prefill?: { type: string; sourceStageId?: string } }) => {
    capturedCreateDialogProps = props;
    return props.open ? <div data-testid="create-stage-dialog" /> : null;
  },
}));

let capturedCanvasProps:
  | {
      stages: Stage[];
      onInspect: (stage: Stage) => void;
      onDelete: (stage: Stage) => void;
      onCreateStage: (type: "groups" | "bracket") => void;
    }
  | undefined;
vi.mock("./schema-canvas", () => ({
  SchemaCanvas: (props: {
    stages: Stage[];
    onInspect: (stage: Stage) => void;
    onDelete: (stage: Stage) => void;
    onCreateStage: (type: "groups" | "bracket") => void;
  }) => {
    capturedCanvasProps = props;
    return (
      <div data-testid="schema-canvas">
        {props.stages.map((stage) => (
          <button key={stage.id} type="button" onClick={() => props.onInspect(stage)}>
            {stage.title}
          </button>
        ))}
      </div>
    );
  },
}));

let capturedOnDragEnd: ((event: unknown) => void) | undefined;
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
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

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccessMock(...args),
  toastError: (...args: unknown[]) => toastErrorMock(...args),
}));

afterEach(() => {
  stagesState = { data: { stages: [groupsStage, bracketStage], issues: [] }, isLoading: false, error: null };
  capturedInspectorProps = undefined;
  capturedCreateDialogProps = undefined;
  capturedCanvasProps = undefined;
  capturedOnDragEnd = undefined;
  vi.clearAllMocks();
});

describe("widgets/nomination-schema/NominationSchemaScreen (spec 0031)", () => {
  it("renders the page header with title, status and a stage count (FR-1)", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    expect(screen.getByText("Длинный меч")).toBeInTheDocument();
    expect(screen.getByText(/2 этап/)).toBeInTheDocument();
  });

  it("shows a skeleton while stages are loading, not the canvas (AC-19)", () => {
    stagesState = { data: undefined, isLoading: true, error: null };
    render(<NominationSchemaScreen nomination={nomination()} />);
    expect(screen.getByTestId("schema-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-canvas")).not.toBeInTheDocument();
  });

  it("shows an error message with a retry button on load failure (AC-19)", () => {
    stagesState = { data: undefined, isLoading: false, error: new Error("Не удалось загрузить схему") };
    render(<NominationSchemaScreen nomination={nomination()} />);
    expect(screen.getByText("Не удалось загрузить схему")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(stagesRefetch).toHaveBeenCalled();
  });

  it("does not render its own error block when the session expired (spec 0039, FR-18/AC-12)", () => {
    stagesState = { data: undefined, isLoading: false, error: new UnauthorizedError() };
    render(<NominationSchemaScreen nomination={nomination()} />);
    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
    expect(screen.queryByText("unauthenticated")).not.toBeInTheDocument();
  });

  it("opens the inspector for a stage on selection and closes it via onClose (FR-18)", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    expect(screen.queryByTestId("stage-inspector")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Группы" }));
    expect(screen.getByTestId("stage-inspector")).toHaveTextContent("Группы");

    act(() => capturedInspectorProps?.onClose());
    expect(screen.queryByTestId("stage-inspector")).not.toBeInTheDocument();
  });

  it("routes canvas 'create stage' requests to the create dialog with no prefill source (FR-17)", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    expect(capturedCreateDialogProps?.open).toBe(false);

    capturedCanvasProps?.onCreateStage("bracket");
    expect(capturedCreateDialogProps).toBeDefined();
  });

  it("dropping a palette stage type on the empty canvas zone opens the create dialog without a source (AC-7)", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    capturedOnDragEnd?.({
      active: { data: { current: { kind: "palette", item: "bracket" } } },
      over: { data: { current: { stageId: null } } },
    });
    expect(setRuleMutate).not.toHaveBeenCalled();
  });

  it("dropping a palette stage type on a stage card sets its source and opens create dialog prefilled (AC-8)", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    capturedOnDragEnd?.({
      active: { data: { current: { kind: "palette", item: "bracket" } } },
      over: { data: { current: { stageId: "s1" } } },
    });
    expect(setRuleMutate).not.toHaveBeenCalled();
  });

  it("dropping the roster on a stage card sets a roster rule (AC-9)", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    capturedOnDragEnd?.({
      active: { data: { current: { kind: "palette", item: "roster" } } },
      over: { data: { current: { stageId: "s1" } } },
    });
    expect(setRuleMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        stageId: "s1",
        rule: expect.objectContaining({ sourceKind: "STAGE_SOURCE_KIND_ROSTER" }),
      }),
      expect.anything(),
    );
  });

  it("dropping one stage card onto another sets a stage-source rule (AC-10)", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    capturedOnDragEnd?.({
      active: { data: { current: { kind: "stage", stageId: "s1" } } },
      over: { data: { current: { stageId: "s2" } } },
    });
    expect(setRuleMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        stageId: "s2",
        rule: expect.objectContaining({ sourceKind: "STAGE_SOURCE_KIND_STAGE", sourceStageId: "s1" }),
      }),
      expect.anything(),
    );
  });

  it("does nothing when a stage card is dropped on itself", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    capturedOnDragEnd?.({
      active: { data: { current: { kind: "stage", stageId: "s1" } } },
      over: { data: { current: { stageId: "s1" } } },
    });
    expect(setRuleMutate).not.toHaveBeenCalled();
  });

  it("does nothing when dropped outside any droppable zone", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    capturedOnDragEnd?.({ active: { data: { current: { kind: "stage", stageId: "s1" } } }, over: null });
    expect(setRuleMutate).not.toHaveBeenCalled();
  });

  it("confirms and deletes a stage requested by the canvas card (FR-24)", () => {
    render(<NominationSchemaScreen nomination={nomination()} />);
    act(() => capturedCanvasProps?.onDelete(groupsStage));
    expect(screen.getByText(/Удалить этап/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(deleteStageMutate).toHaveBeenCalledWith("s1", expect.anything());
  });
});
