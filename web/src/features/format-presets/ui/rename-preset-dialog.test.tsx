// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenamePresetDialog } from "./rename-preset-dialog";
import type { FormatPreset } from "@/entities/stage/lib/types";

const preset: FormatPreset = {
  id: "p1",
  name: "Группы + плейофф",
  stages: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const renameMutate = vi.fn();
let renameError: Error | null = null;
const renameReset = vi.fn();

vi.mock("../api/use-rename-preset", () => ({
  useRenamePreset: () => ({
    mutate: renameMutate,
    isPending: false,
    error: renameError,
    reset: renameReset,
  }),
}));

const toastSuccess = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
}));

describe("RenamePresetDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renameError = null;
  });

  afterEach(() => cleanup());

  it("shows an inline error and does not submit when the name is empty", () => {
    const onOpenChange = vi.fn();
    render(<RenamePresetDialog preset={preset} open onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText(/имя/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /сохранить/i }));

    expect(screen.getByText(/введите имя/i)).toBeInTheDocument();
    expect(renameMutate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("submits the new name and shows a success toast, closing the dialog", () => {
    renameMutate.mockImplementation((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const onOpenChange = vi.fn();
    render(<RenamePresetDialog preset={preset} open onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText(/имя/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Новое имя" } });
    fireEvent.click(screen.getByRole("button", { name: /сохранить/i }));

    expect(renameMutate).toHaveBeenCalledWith(
      { presetId: "p1", name: "Новое имя" },
      expect.anything(),
    );
    expect(toastSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the translated conflict error and keeps the dialog open", () => {
    renameError = new Error("Пресет с таким именем уже есть — выберите другое");
    const onOpenChange = vi.fn();
    render(<RenamePresetDialog preset={preset} open onOpenChange={onOpenChange} />);

    expect(
      screen.getByText("Пресет с таким именем уже есть — выберите другое"),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
