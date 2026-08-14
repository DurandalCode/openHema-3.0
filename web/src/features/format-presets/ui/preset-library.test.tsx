// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetLibrary } from "./preset-library";
import type { FormatPreset } from "@/entities/stage/lib/types";

const groupsSpec = {
  title: "Группы",
  type: "STAGE_TYPE_GROUPS" as const,
  bracket: { size: 0, thirdPlace: false },
  groups: { groupCount: 4 },
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

function preset(overrides: Partial<FormatPreset>): FormatPreset {
  return {
    id: "p1",
    name: "Пресет",
    stages: [groupsSpec, bracketSpec],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

let presetsState: { data: FormatPreset[] | undefined; isLoading: boolean; error: Error | null } = {
  data: [],
  isLoading: false,
  error: null,
};
const presetsRefetch = vi.fn();

vi.mock("../api/use-presets", () => ({
  usePresets: () => ({ ...presetsState, refetch: presetsRefetch }),
}));

type MutateOpts = { onSuccess?: () => void; onError?: (e: Error) => void };
const deleteMutate = vi.fn((_id: string, opts?: MutateOpts) => opts?.onSuccess?.());
vi.mock("../api/use-delete-preset", () => ({
  useDeletePreset: () => ({ mutate: deleteMutate, isPending: false }),
}));

const renameMutate = vi.fn();
vi.mock("../api/use-rename-preset", () => ({
  useRenamePreset: () => ({ mutate: renameMutate, isPending: false, error: null, reset: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastUndo = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
  toastUndo: (...args: unknown[]) => toastUndo(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  presetsState = { data: [], isLoading: false, error: null };
});

afterEach(() => cleanup());

describe("PresetLibrary", () => {
  it("fills the section header with crumb, title and a pluralized preset count (AC-11)", () => {
    presetsState = {
      data: [
        preset({ id: "p1", name: "А" }),
        preset({ id: "p2", name: "Б" }),
        preset({ id: "p3", name: "В" }),
        preset({ id: "p4", name: "Г" }),
        preset({ id: "p5", name: "Д" }),
        preset({ id: "p6", name: "Е" }),
      ],
      isLoading: false,
      error: null,
    };
    render(<PresetLibrary />);

    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(within(header).getByText("ФОРМАТЫ · ВНЕ ТУРНИРА")).toBeInTheDocument();
    expect(within(header).getByText("Библиотека форматов")).toBeInTheDocument();
    expect(within(header).getByText("6 пресетов")).toBeInTheDocument();
  });

  it("explains what a preset is and links to nominations (AC-11/FR-18)", () => {
    render(<PresetLibrary />);
    expect(screen.getByText(/схема номинации/i)).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /номинаци/i });
    expect(links.some((link) => link.getAttribute("href") === "/admin/nominations")).toBe(true);
  });

  it("renders preset cards in deterministic order by name (AC-12)", () => {
    presetsState = {
      data: [
        preset({ id: "p1", name: "Ясень" }),
        preset({ id: "p2", name: "Береза" }),
        preset({ id: "p3", name: "Дуб" }),
      ],
      isLoading: false,
      error: null,
    };
    render(<PresetLibrary />);

    const names = [...document.querySelectorAll('[data-slot="card-title"]')].map((el) => el.textContent);
    expect(names).toEqual(["Береза", "Дуб", "Ясень"]);
  });

  it("opens the rename dialog for the chosen preset", () => {
    presetsState = { data: [preset({ id: "p1", name: "Классика" })], isLoading: false, error: null };
    render(<PresetLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "Переименовать" }));

    expect(screen.getByRole("dialog", { name: /переименовать пресет/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/имя/i)).toHaveValue("Классика");
  });

  it("deletes through a confirm dialog listing consequences, without confirmWord or an undo toast (AC-14)", () => {
    presetsState = { data: [preset({ id: "p1", name: "Классика" })], isLoading: false, error: null };
    render(<PresetLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/у всех организаторов/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/не изменятся/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/введите/i)).not.toBeInTheDocument();

    const confirmButton = within(dialog).getByRole("button", { name: "Удалить" });
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    expect(deleteMutate).toHaveBeenCalledWith("p1", expect.anything());
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastUndo).not.toHaveBeenCalled();
  });

  it("shows a loading skeleton, a retryable load error, and an empty state with a link to nominations (AC-15)", () => {
    presetsState = { data: undefined, isLoading: true, error: null };
    const { unmount } = render(<PresetLibrary />);
    expect(document.querySelectorAll('[data-slot="skeleton-card"]').length).toBeGreaterThan(0);
    unmount();

    presetsState = { data: undefined, isLoading: false, error: new Error("Сеть недоступна") };
    const { unmount: unmount2 } = render(<PresetLibrary />);
    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(presetsRefetch).toHaveBeenCalledTimes(1);
    unmount2();

    presetsState = { data: [], isLoading: false, error: null };
    render(<PresetLibrary />);
    expect(screen.getByText(/Пресетов ещё нет/i)).toBeInTheDocument();
    expect(screen.getByText(/сохраните её как пресет/i)).toBeInTheDocument();
    const emptyLinks = screen.getAllByRole("link", { name: /номинаци/i });
    expect(emptyLinks.some((link) => link.getAttribute("href") === "/admin/nominations")).toBe(true);
  });
});
