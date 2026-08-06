// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetLibrary } from "./preset-library";
import type { FormatPreset } from "@/entities/stage/lib/types";

const groupsSpec = {
  title: "Группы",
  type: "STAGE_TYPE_GROUPS" as const,
  bracket: { size: 0, thirdPlace: false },
  groups: { groupCount: 2 },
  sourceKind: "STAGE_SOURCE_KIND_UNSPECIFIED" as const,
  sourceIndex: -1,
  selector: "STAGE_SELECTOR_KIND_UNSPECIFIED" as const,
  placeFrom: 0,
  placeTo: 0,
  method: "STAGE_LAYOUT_METHOD_UNSPECIFIED" as const,
};

const bracketSpec = {
  title: "Плейофф",
  type: "STAGE_TYPE_BRACKET" as const,
  bracket: { size: 8, thirdPlace: false },
  groups: { groupCount: 0 },
  sourceKind: "STAGE_SOURCE_KIND_STAGE" as const,
  sourceIndex: 0,
  selector: "STAGE_SELECTOR_KIND_GROUP_PLACES" as const,
  placeFrom: 1,
  placeTo: 2,
  method: "STAGE_LAYOUT_METHOD_SEEDED" as const,
};

const preset1: FormatPreset = {
  id: "p1",
  name: "Группы + плейофф",
  stages: [groupsSpec, bracketSpec],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const preset2: FormatPreset = {
  id: "p2",
  name: "Только группы",
  stages: [groupsSpec],
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

let presetsData: FormatPreset[] | undefined = [preset1, preset2];
let presetsLoading = false;
let presetsError: Error | null = null;

const renameMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
let renameError: Error | null = null;

const deleteMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
let deleteError: Error | null = null;

vi.mock("../api/use-presets", () => ({
  usePresets: () => ({ data: presetsData, isLoading: presetsLoading, error: presetsError }),
}));

vi.mock("../api/use-rename-preset", () => ({
  useRenamePreset: () => ({
    mutate: renameMutate,
    isPending: false,
    error: renameError,
    reset: vi.fn(),
  }),
}));

vi.mock("../api/use-delete-preset", () => ({
  useDeletePreset: () => ({
    mutate: deleteMutate,
    isPending: false,
    error: deleteError,
    reset: vi.fn(),
  }),
}));

describe("PresetLibrary", () => {
  beforeEach(() => {
    presetsData = [preset1, preset2];
    presetsLoading = false;
    presetsError = null;
    renameError = null;
    deleteError = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders every preset with name and formatPresetSummary", () => {
    render(<PresetLibrary />);
    expect(screen.getByText("Группы + плейофф")).toBeInTheDocument();
    expect(screen.getByText("Группы (2) → Сетка (8)")).toBeInTheDocument();
    expect(screen.getByText("Только группы")).toBeInTheDocument();
    expect(screen.getByText("Группы (2)")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no presets", () => {
    presetsData = [];
    render(<PresetLibrary />);
    expect(screen.getByText(/Пресетов ещё нет/i)).toBeInTheDocument();
  });

  it("renaming a preset switches to edit mode and submits the new name", () => {
    render(<PresetLibrary />);
    fireEvent.click(screen.getByRole("button", { name: /Переименовать «Группы \+ плейофф»/i }));

    const input = screen.getByLabelText(/Новое имя пресета/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Новое имя" } });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить имя/i }));

    expect(renameMutate).toHaveBeenCalledWith(
      { presetId: "p1", name: "Новое имя" },
      expect.anything(),
    );
  });

  it("deleting a preset requires an inline confirmation before calling the mutation", () => {
    render(<PresetLibrary />);
    fireEvent.click(screen.getByRole("button", { name: /Удалить «Группы \+ плейофф»/i }));

    // подтверждение появляется, мутация ещё не вызвана
    expect(deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(deleteMutate).toHaveBeenCalledWith("p1", expect.anything());
  });

  it("shows the server error for a taken name on rename", () => {
    renameError = new Error("preset name is already taken");
    render(<PresetLibrary />);
    fireEvent.click(screen.getByRole("button", { name: /Переименовать «Группы \+ плейофф»/i }));
    expect(screen.getByText("preset name is already taken")).toBeInTheDocument();
  });
});
