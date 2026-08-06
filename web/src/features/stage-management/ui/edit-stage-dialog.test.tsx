// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EditStageDialog } from "./edit-stage-dialog";
import type { Stage } from "@/entities/stage/lib/types";

/**
 * Radix `Select` нуждается в `scrollIntoView`/pointer-capture, которых нет в
 * jsdom (см. `create-stage-dialog.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

const bracketStage: Stage = {
  id: "b1",
  nominationId: "n1",
  position: 1,
  title: "Плейофф",
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 8, thirdPlace: false },
  groups: null,
  rule: null,
};

const groupsStage: Stage = {
  id: "g1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: null,
  groups: { groupCount: 4 },
  rule: null,
};

const updateMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
let updateError: Error | null = null;

vi.mock("../api/use-update-stage", () => ({
  useUpdateStage: () => ({
    mutate: updateMutate,
    isPending: false,
    error: updateError,
    reset: vi.fn(),
  }),
}));

function openDialog(stage: Stage, composeEmpty: boolean) {
  render(<EditStageDialog stage={stage} composeEmpty={composeEmpty} />);
  fireEvent.click(screen.getByRole("button", { name: /Изменить этап/i }));
}

describe("EditStageDialog", () => {
  beforeEach(() => {
    updateError = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("title field is always editable", () => {
    openDialog(bracketStage, false);
    const titleInput = screen.getByLabelText("Название") as HTMLInputElement;
    expect(titleInput).not.toBeDisabled();
    fireEvent.change(titleInput, { target: { value: "Новое название" } });
    expect(titleInput.value).toBe("Новое название");
  });

  it("does not show the stage type anywhere (AC-3)", () => {
    openDialog(bracketStage, true);
    expect(screen.queryByText(/Тип этапа/i)).not.toBeInTheDocument();
  });

  it("disables bracket config fields and shows a hint when composeEmpty is false", () => {
    openDialog(bracketStage, false);
    expect(screen.getByRole("combobox", { name: "Размер сетки" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Бой за 3-е место" })).toBeDisabled();
    expect(screen.getByText(/Конфиг можно менять, пока состав пуст/i)).toBeInTheDocument();
  });

  it("enables bracket config fields when composeEmpty is true", () => {
    openDialog(bracketStage, true);
    expect(screen.getByRole("combobox", { name: "Размер сетки" })).not.toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Бой за 3-е место" })).not.toBeDisabled();
  });

  it("disables the group count field when composeEmpty is false", () => {
    openDialog(groupsStage, false);
    expect(screen.getByLabelText("Число групп")).toBeDisabled();
    expect(screen.getByText(/Конфиг можно менять, пока состав пуст/i)).toBeInTheDocument();
  });

  it("enables the group count field when composeEmpty is true", () => {
    openDialog(groupsStage, true);
    expect(screen.getByLabelText("Число групп")).not.toBeDisabled();
  });

  it("submits title + bracket config on save", () => {
    openDialog(bracketStage, true);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        stageId: "b1",
        input: { title: "Плейофф", bracket: { size: 8, thirdPlace: false } },
      },
      expect.anything(),
    );
  });

  it("submits title + groups config on save", () => {
    openDialog(groupsStage, true);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        stageId: "g1",
        input: { title: "Групповой этап", groups: { groupCount: 4 } },
      },
      expect.anything(),
    );
  });

  it("changing bracket size and submitting sends the new size", () => {
    openDialog(bracketStage, true);
    fireEvent.click(screen.getByRole("combobox", { name: "Размер сетки" }));
    fireEvent.click(screen.getByText("16"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        stageId: "b1",
        input: { title: "Плейофф", bracket: { size: 16, thirdPlace: false } },
      },
      expect.anything(),
    );
  });

  it("shows the server error when update is rejected", () => {
    updateError = new Error("stage is locked");
    openDialog(bracketStage, false);
    expect(screen.getByText("stage is locked")).toBeInTheDocument();
  });
});
