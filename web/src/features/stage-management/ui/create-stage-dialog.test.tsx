// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateStageDialog } from "./create-stage-dialog";
import type { Stage } from "@/entities/stage/lib/types";

/**
 * Radix `Select` нуждается в `scrollIntoView`/pointer-capture, которых нет в
 * jsdom (см. спайк при разработке T16) — полифиллы локальны этому файлу,
 * остальные тесты фичи их не используют.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

const groupsStage: Stage = {
  id: "g1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_READY",
  bracket: null,
  groups: { groupCount: 4 },
  rule: null,
};

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

const createMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
let createError: Error | null = null;

vi.mock("../api/use-create-stage", () => ({
  useCreateStage: () => ({
    mutate: createMutate,
    isPending: false,
    error: createError,
    reset: vi.fn(),
  }),
}));

function openDialog(stages: Stage[] = [groupsStage, bracketStage]) {
  render(<CreateStageDialog nominationId="n1" stages={stages} />);
  fireEvent.click(screen.getByRole("button", { name: /Добавить этап/i }));
}

function selectOption(triggerName: RegExp | string, optionText: string) {
  fireEvent.click(screen.getByRole("combobox", { name: triggerName }));
  fireEvent.click(screen.getByText(optionText));
}

describe("CreateStageDialog", () => {
  beforeEach(() => {
    createError = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("defaults to bracket type: shows bracket size + third place, hides group count", () => {
    openDialog();
    expect(screen.getByText("Размер сетки")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Бой за 3-е место" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Число групп")).not.toBeInTheDocument();
  });

  it("switching type to groups shows the group count field and hides bracket fields (FR-8)", () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Группы" }));

    expect(screen.getByLabelText("Число групп")).toBeInTheDocument();
    expect(screen.queryByText("Размер сетки")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Бой за 3-е место" })).not.toBeInTheDocument();
  });

  it("rule block is hidden until 'Правило отбора' is checked", () => {
    openDialog();
    expect(screen.queryByText("Источник")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Правило отбора" }));
    expect(screen.getByText("Источник")).toBeInTheDocument();
    expect(screen.getByText("Селектор")).toBeInTheDocument();
  });

  it("selecting a source stage shows the selector + place bounds once a non-ALL selector is chosen (FR-3)", () => {
    openDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: "Правило отбора" }));

    // ALL по умолчанию (источник — ростер) — границ мест не видно
    expect(screen.queryByLabelText("От места")).not.toBeInTheDocument();

    selectOption("Источник", "Групповой этап");
    selectOption("Селектор", "Места X–Y каждой группы");

    expect(screen.getByLabelText("От места")).toBeInTheDocument();
    expect(screen.getByLabelText(/До места/)).toBeInTheDocument();
  });

  it("only offers groups-type stages as a rule source (FR-2)", () => {
    openDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: "Правило отбора" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Источник" }));

    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.queryByText("Плейофф")).not.toBeInTheDocument();
  });

  it("submits a bracket payload with type: 'bracket' and no rule when the checkbox is unchecked", () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    expect(createMutate).toHaveBeenCalledWith(
      { type: "bracket", title: "Плейофф", bracketSize: 8, thirdPlace: false },
      expect.anything(),
    );
  });

  it("submits a groups payload with groupCount and no bracket fields", () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Группы" }));
    fireEvent.change(screen.getByLabelText("Число групп"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    expect(createMutate).toHaveBeenCalledWith(
      { type: "groups", title: "Группы", groupCount: 3 },
      expect.anything(),
    );
  });

  it("submits a rule with place bounds when selector is GROUP_PLACES and a stage source is chosen", () => {
    openDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: "Правило отбора" }));
    selectOption("Источник", "Групповой этап");
    selectOption("Селектор", "Места X–Y каждой группы");
    fireEvent.change(screen.getByLabelText("От места"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/До места/), { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    expect(createMutate).toHaveBeenCalledWith(
      {
        type: "bracket",
        title: "Плейофф",
        bracketSize: 8,
        thirdPlace: false,
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_STAGE",
          sourceStageId: "g1",
          selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
          placeFrom: 1,
          placeTo: 2,
        },
      },
      expect.anything(),
    );
  });

  it("submits an open upper bound (empty 'до места') as placeTo: 0", () => {
    openDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: "Правило отбора" }));
    selectOption("Источник", "Групповой этап");
    selectOption("Селектор", "Места X–Y каждой группы");
    fireEvent.change(screen.getByLabelText("От места"), { target: { value: "3" } });

    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        rule: expect.objectContaining({ placeFrom: 3, placeTo: 0 }),
      }),
      expect.anything(),
    );
  });

  it("submits rule with sourceKind ROSTER and empty sourceStageId when source stays as roster with ALL selector", () => {
    openDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: "Правило отбора" }));

    fireEvent.click(screen.getByRole("button", { name: "Создать" }));

    expect(createMutate).toHaveBeenCalledWith(
      {
        type: "bracket",
        title: "Плейофф",
        bracketSize: 8,
        thirdPlace: false,
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_ROSTER",
          sourceStageId: "",
          selector: "STAGE_SELECTOR_KIND_ALL",
          placeFrom: 0,
          placeTo: 0,
        },
      },
      expect.anything(),
    );
  });

  it("shows the server error when creation is rejected", () => {
    createError = new Error("bracket size must be a power of two");
    openDialog();
    expect(screen.getByText("bracket size must be a power of two")).toBeInTheDocument();
  });

  describe("controlled mode (спека 0031, T9)", () => {
    it("renders no trigger button when `open` prop is passed — the widget opens it programmatically", () => {
      render(
        <CreateStageDialog nominationId="n1" stages={[groupsStage, bracketStage]} open={false} onOpenChange={vi.fn()} />,
      );
      expect(screen.queryByRole("button", { name: /Добавить этап/i })).not.toBeInTheDocument();
    });

    it("shows dialog content when `open` is true", () => {
      render(
        <CreateStageDialog nominationId="n1" stages={[groupsStage, bracketStage]} open={true} onOpenChange={vi.fn()} />,
      );
      expect(screen.getByText("Новый этап")).toBeInTheDocument();
    });

    it("calls onOpenChange(false) when the dialog is dismissed", () => {
      const onOpenChange = vi.fn();
      render(
        <CreateStageDialog
          nominationId="n1"
          stages={[groupsStage, bracketStage]}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onOpenChange(false) after a successful submit", () => {
      const onOpenChange = vi.fn();
      render(
        <CreateStageDialog
          nominationId="n1"
          stages={[groupsStage, bracketStage]}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Создать" }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("prefill (спека 0031, FR-13/FR-14, AC-7/AC-8)", () => {
    it("preselects the bracket type and submits without a rule when only `type` is prefilled (AC-7)", () => {
      render(
        <CreateStageDialog
          nominationId="n1"
          stages={[groupsStage, bracketStage]}
          open={true}
          onOpenChange={vi.fn()}
          prefill={{ type: "bracket" }}
        />,
      );
      expect(screen.getByText("Размер сетки")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Создать" }));

      expect(createMutate).toHaveBeenCalledWith(
        { type: "bracket", title: "Плейофф", bracketSize: 8, thirdPlace: false },
        expect.anything(),
      );
    });

    it("preselects the groups type when prefilled with type: 'groups'", () => {
      render(
        <CreateStageDialog
          nominationId="n1"
          stages={[groupsStage, bracketStage]}
          open={true}
          onOpenChange={vi.fn()}
          prefill={{ type: "groups" }}
        />,
      );
      expect(screen.getByLabelText("Число групп")).toBeInTheDocument();
      expect(screen.queryByText("Размер сетки")).not.toBeInTheDocument();
    });

    it("preselects type and rule source when prefilled with sourceStageId (AC-8)", () => {
      render(
        <CreateStageDialog
          nominationId="n1"
          stages={[groupsStage, bracketStage]}
          open={true}
          onOpenChange={vi.fn()}
          prefill={{ type: "bracket", sourceStageId: "g1" }}
        />,
      );

      // rule block already open, source preselected to the dragged card
      expect(screen.getByText("Источник")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Источник" })).toHaveTextContent("Групповой этап");

      fireEvent.click(screen.getByRole("button", { name: "Создать" }));

      expect(createMutate).toHaveBeenCalledWith(
        {
          type: "bracket",
          title: "Плейофф",
          bracketSize: 8,
          thirdPlace: false,
          rule: {
            sourceKind: "STAGE_SOURCE_KIND_STAGE",
            sourceStageId: "g1",
            selector: "STAGE_SELECTOR_KIND_ALL",
            placeFrom: 0,
            placeTo: 0,
          },
        },
        expect.anything(),
      );
    });

    it("re-applies prefill when the dialog is reopened with a different prefill", () => {
      const { rerender } = render(
        <CreateStageDialog
          nominationId="n1"
          stages={[groupsStage, bracketStage]}
          open={false}
          onOpenChange={vi.fn()}
          prefill={{ type: "groups" }}
        />,
      );
      rerender(
        <CreateStageDialog
          nominationId="n1"
          stages={[groupsStage, bracketStage]}
          open={true}
          onOpenChange={vi.fn()}
          prefill={{ type: "groups" }}
        />,
      );
      expect(screen.getByLabelText("Число групп")).toBeInTheDocument();
    });
  });
});
