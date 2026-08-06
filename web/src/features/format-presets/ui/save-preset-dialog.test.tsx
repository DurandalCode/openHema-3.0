// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavePresetDialog } from "./save-preset-dialog";

const saveMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
let saveError: Error | null = null;

vi.mock("../api/use-save-preset", () => ({
  useSavePreset: () => ({
    mutate: saveMutate,
    isPending: false,
    error: saveError,
    reset: vi.fn(),
  }),
}));

function openDialog() {
  render(<SavePresetDialog nominationId="n1" />);
  fireEvent.click(screen.getByRole("button", { name: /Сохранить как пресет/i }));
}

describe("SavePresetDialog", () => {
  beforeEach(() => {
    saveError = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("submit is disabled until a name is entered", () => {
    openDialog();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Имя пресета/i), {
      target: { value: "Группы + двойной плейофф" },
    });
    expect(screen.getByRole("button", { name: "Сохранить" })).not.toBeDisabled();
  });

  it("submits {name, nominationId} to the mutation", () => {
    openDialog();
    fireEvent.change(screen.getByLabelText(/Имя пресета/i), {
      target: { value: "Группы + двойной плейофф" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(saveMutate).toHaveBeenCalledWith(
      { name: "Группы + двойной плейофф", nominationId: "n1" },
      expect.anything(),
    );
  });

  it("shows the server error for a taken name (AC-17, ErrPresetNameTaken)", () => {
    saveError = new Error("ErrPresetNameTaken");
    openDialog();
    expect(screen.getByText("ErrPresetNameTaken")).toBeInTheDocument();
  });
});
