// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StageInspector } from "./stage-inspector";
import type { Stage } from "@/entities/stage/lib/types";
import { useUnsavedGuardStore } from "@/shared/lib/unsaved-guard-store";

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
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: null,
  groups: { groupCount: 4 },
  rule: null,
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
};

const ruledBracketStage: Stage = {
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
    selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
    placeFrom: 1,
    placeTo: 2,
    method: "STAGE_LAYOUT_METHOD_SEEDED",
  },
  executionStatus: "STAGE_STATUS_UNSPECIFIED",
};

const readyStage: Stage = {
  ...groupsStage,
  id: "s3",
  status: "POOL_LAYOUT_STATUS_READY",
};

const updateMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
const setRuleMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
const setStatusMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
const deleteMutate = vi.fn(
  (_vars: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) =>
    opts?.onSuccess?.(),
);
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

let updateError: Error | null = null;
let setRuleError: Error | null = null;
let setStatusError: Error | null = null;
let deleteError: Error | null = null;

vi.mock("@/features/stage-management/api/use-update-stage", () => ({
  useUpdateStage: () => ({ mutate: updateMutate, isPending: false, error: updateError, reset: vi.fn() }),
}));
vi.mock("@/features/stage-management/api/use-set-stage-rule", () => ({
  useSetStageRule: () => ({ mutate: setRuleMutate, isPending: false, error: setRuleError, reset: vi.fn() }),
}));
vi.mock("@/features/stage-management/api/use-set-stage-status", () => ({
  useSetStageStatus: () => ({ mutate: setStatusMutate, isPending: false, error: setStatusError, reset: vi.fn() }),
}));
vi.mock("@/features/stage-management/api/use-delete-stage", () => ({
  useDeleteStage: () => ({ mutate: deleteMutate, isPending: false, error: deleteError, reset: vi.fn() }),
}));
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (message: string) => toastSuccessMock(message),
  toastError: (message: string, options?: { retry?: () => void }) => toastErrorMock(message, options),
}));

function selectOption(triggerName: RegExp | string, optionText: string) {
  fireEvent.click(screen.getByRole("combobox", { name: triggerName }));
  fireEvent.click(screen.getByText(optionText));
}

function renderInspector(
  stage: Stage,
  overrides: Partial<{ stages: Stage[]; onClose: () => void }> = {},
) {
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <StageInspector
      stage={stage}
      stages={overrides.stages ?? [groupsStage, ruledBracketStage]}
      nominationId="n1"
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe("StageInspector (спека 0031, T13)", () => {
  beforeEach(() => {
    updateError = null;
    setRuleError = null;
    setStatusError = null;
    deleteError = null;
    vi.clearAllMocks();
    useUnsavedGuardStore.setState({ dirtyReason: null, pendingHref: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("closes via the × button", () => {
    const { onClose } = renderInspector(groupsStage);
    fireEvent.click(screen.getByRole("button", { name: /Закрыть/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("edits the title and saves it on blur (FR-19)", () => {
    renderInspector(groupsStage);
    const titleInput = screen.getByLabelText("Название");
    fireEvent.change(titleInput, { target: { value: "Новое название" } });
    fireEvent.blur(titleInput);

    expect(updateMutate).toHaveBeenCalledWith(
      { stageId: "s1", input: { title: "Новое название" } },
      expect.anything(),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("rejects an empty title without sending a request (inline error)", () => {
    renderInspector(groupsStage);
    const titleInput = screen.getByLabelText("Название");
    fireEvent.change(titleInput, { target: { value: "  " } });
    fireEvent.blur(titleInput);

    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/название не может быть пустым/i)).toBeInTheDocument();
  });

  it("shows the type as read-only text with an explanation (FR-19)", () => {
    renderInspector(groupsStage);
    expect(screen.getByText("группы")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сетка" })).not.toBeInTheDocument();
    expect(screen.getByText(/пересозданием/i)).toBeInTheDocument();
  });

  it("config fields are editable when composition is empty (draft status)", () => {
    renderInspector(groupsStage);
    expect(screen.getByLabelText("Число групп")).toBeEnabled();
  });

  it("config fields are locked with an explanation when composition is not empty (AC-13)", () => {
    renderInspector(readyStage);
    expect(screen.getByLabelText("Число групп")).toBeDisabled();
    expect(screen.getByText(/состав.*не пуст|нельзя менять/i)).toBeInTheDocument();
  });

  it("shows 'Правила нет — набирается руками' for a stage without a rule", () => {
    renderInspector(groupsStage);
    expect(screen.getByText("Правила нет — набирается руками")).toBeInTheDocument();
  });

  it("shows the live rule label matching the current form values (AC-11)", () => {
    renderInspector(ruledBracketStage);
    expect(screen.getByText("Места 1–2 каждой группы · Групповой этап")).toBeInTheDocument();
  });

  it("editing the upper bound and saving updates the rule (AC-11)", () => {
    renderInspector(ruledBracketStage);
    const placeTo = screen.getByLabelText(/До места/);
    fireEvent.change(placeTo, { target: { value: "3" } });

    expect(screen.getByText("Места 1–3 каждой группы · Групповой этап")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить правило" }));

    expect(setRuleMutate).toHaveBeenCalledWith(
      {
        stageId: "s2",
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_STAGE",
          sourceStageId: "s1",
          selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
          placeFrom: 1,
          placeTo: 3,
        },
      },
      expect.anything(),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("'Очистить' clears the rule immediately (AC-11)", () => {
    renderInspector(ruledBracketStage);
    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));

    expect(setRuleMutate).toHaveBeenCalledWith({ stageId: "s2", rule: null }, expect.anything());
  });

  it("selector is locked to 'Все участники' when the source is the roster (AC-12)", () => {
    renderInspector(groupsStage);
    selectOption("Источник", "Ростер номинации");

    expect(screen.getByRole("combobox", { name: "Селектор" })).toHaveTextContent("Все участники");
    expect(screen.getByRole("combobox", { name: "Селектор" })).toBeDisabled();
    expect(screen.queryByLabelText(/От места/)).not.toBeInTheDocument();
  });

  it("toggling composition lock calls useSetStageStatus and shows a success toast (AC-14)", () => {
    renderInspector(groupsStage);
    fireEvent.click(screen.getByRole("button", { name: /Зафиксировать/i }));

    expect(setStatusMutate).toHaveBeenCalledWith(
      { stageId: "s1", status: "ready" },
      expect.anything(),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("toggling an already-locked stage back to draft", () => {
    renderInspector(readyStage);
    fireEvent.click(screen.getByRole("button", { name: /черновик/i }));

    expect(setStatusMutate).toHaveBeenCalledWith(
      { stageId: "s3", status: "draft" },
      expect.anything(),
    );
  });

  it("has an 'Открыть посев →' link to the stage page", () => {
    renderInspector(groupsStage);
    const link = screen.getByRole("link", { name: /посев/i });
    expect(link).toHaveAttribute("href", "/admin/nominations/n1/stages/s1");
  });

  it("delete requires confirmation via ConfirmDialog with consequences listed (AC-15/FR-24)", () => {
    renderInspector(groupsStage);
    fireEvent.click(screen.getByRole("button", { name: "Удалить этап" }));

    expect(screen.getByText(/Удалить.*Групповой этап/)).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("confirming delete calls the mutation, shows a success toast and closes the inspector (AC-15)", () => {
    const { onClose } = renderInspector(groupsStage);
    fireEvent.click(screen.getByRole("button", { name: "Удалить этап" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.anything());
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a Russian error toast when deletion is rejected by the server (AC-15)", () => {
    deleteMutate.mockImplementationOnce((_id, opts?: { onError?: (err: Error) => void }) => {
      opts?.onError?.(new Error("pool: stage is a source for another stage"));
    });
    renderInspector(groupsStage);
    fireEvent.click(screen.getByRole("button", { name: "Удалить этап" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(toastErrorMock.mock.calls[0][0]).toEqual(expect.stringContaining("источником"));
  });

  // spec 0039, T20 (FR-13, FR-15): инспектор держит два независимых
  // несохранённых черновика («Параметры», «Правило отбора») — guard должен
  // видеть изменение любого из них.
  it("marks the unsaved-guard store dirty when editing config fields (spec 0039)", () => {
    renderInspector(groupsStage);
    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();

    fireEvent.change(screen.getByLabelText("Число групп"), { target: { value: "6" } });

    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("этап «Групповой этап»");
  });

  it("marks the unsaved-guard store dirty when editing the selection rule (spec 0039)", () => {
    renderInspector(ruledBracketStage);
    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();

    fireEvent.change(screen.getByLabelText(/До места/), { target: { value: "3" } });

    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("этап «Плейофф»");
  });

  it("clears the unsaved-guard flag when switching to a different stage (spec 0039)", () => {
    const { rerender } = render(
      <StageInspector
        stage={groupsStage}
        stages={[groupsStage, ruledBracketStage]}
        nominationId="n1"
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Число групп"), { target: { value: "6" } });
    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("этап «Групповой этап»");

    rerender(
      <StageInspector
        stage={ruledBracketStage}
        stages={[groupsStage, ruledBracketStage]}
        nominationId="n1"
        onClose={vi.fn()}
      />,
    );

    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();
  });
});
