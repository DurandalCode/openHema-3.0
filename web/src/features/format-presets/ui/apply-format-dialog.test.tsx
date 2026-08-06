// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplyFormatDialog } from "./apply-format-dialog";
import type { FormatPreset } from "@/entities/stage/lib/types";

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

const preset: FormatPreset = {
  id: "p1",
  name: "Группы + двойной плейофф",
  stages: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const applyMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
let applyError: Error | null = null;

vi.mock("../api/use-presets", () => ({
  usePresets: () => ({ data: [preset], isLoading: false, error: null }),
}));

vi.mock("../api/use-apply-format", () => ({
  useApplyFormat: () => ({
    mutate: applyMutate,
    isPending: false,
    error: applyError,
    reset: vi.fn(),
  }),
}));

function openDialog() {
  render(<ApplyFormatDialog nominationId="n2" />);
  fireEvent.click(screen.getByRole("button", { name: /Применить формат/i }));
}

describe("ApplyFormatDialog", () => {
  beforeEach(() => {
    applyError = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the explicit replace-schema warning", () => {
    openDialog();
    expect(screen.getByText(/Схема номинации будет заменена целиком/i)).toBeInTheDocument();
  });

  it("defaults to the preset source and lists library presets", () => {
    openDialog();
    expect(screen.getByText("Пресет")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Номинация-донор/i)).not.toBeInTheDocument();
  });

  it("switching to 'Скопировать из номинации' shows a donor id field", () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Скопировать из номинации" }));
    expect(screen.getByLabelText(/Номинация-донор/i)).toBeInTheDocument();
    expect(screen.queryByText("Пресет")).not.toBeInTheDocument();
  });

  it("submit is disabled until a preset is chosen", () => {
    openDialog();
    expect(screen.getByRole("button", { name: "Применить" })).toBeDisabled();
  });

  it("submits {presetId} when a preset is selected", () => {
    openDialog();
    fireEvent.click(screen.getByRole("combobox", { name: "Пресет" }));
    fireEvent.click(screen.getByText("Группы + двойной плейофф"));
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));

    expect(applyMutate).toHaveBeenCalledWith({ presetId: "p1" }, expect.anything());
  });

  it("submits {sourceNominationId} when copying from a donor nomination", () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Скопировать из номинации" }));
    fireEvent.change(screen.getByLabelText(/Номинация-донор/i), { target: { value: "n1" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));

    expect(applyMutate).toHaveBeenCalledWith({ sourceNominationId: "n1" }, expect.anything());
  });

  it("shows the server's FailedPrecondition error text as-is", () => {
    applyError = new Error("schema is not empty: reset stages first");
    openDialog();
    expect(screen.getByText("schema is not empty: reset stages first")).toBeInTheDocument();
  });
});
