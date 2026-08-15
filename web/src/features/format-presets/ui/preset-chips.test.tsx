// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetChips } from "./preset-chips";
import type { FormatPreset } from "@/entities/stage/lib/types";

/**
 * PresetChips.test — спека 0031, FR-25/FR-26, AC-16/AC-17: чипы пресетов со
 * «взводом» в тулбаре вместо `ApplyFormatDialog`/`SavePresetDialog` (решение
 * пользователя №3, spec.md «Решения по открытым вопросам»). Хуки данных
 * мокаются целиком — по образцу `apply-format-dialog.test.tsx`/
 * `save-preset-dialog.test.tsx`: компонент не отвечает за сеть, только за
 * взвод/применение и инлайн-сохранение.
 */

const presetA: FormatPreset = {
  id: "p1",
  name: "Группы → Плейофф-8",
  stages: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const presetB: FormatPreset = {
  id: "p2",
  name: "Только плейофф-16",
  stages: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const applyMutate = vi.fn((_vars, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) =>
  opts?.onSuccess?.(),
);
const saveMutate = vi.fn((_vars, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) =>
  opts?.onSuccess?.(),
);
const saveReset = vi.fn();

vi.mock("../api/use-presets", () => ({
  usePresets: () => ({ data: [presetA, presetB], isLoading: false, error: null }),
}));

vi.mock("../api/use-apply-format", () => ({
  useApplyFormat: () => ({ mutate: applyMutate, isPending: false }),
}));

vi.mock("../api/use-save-preset", () => ({
  useSavePreset: () => ({ mutate: saveMutate, isPending: false, reset: saveReset }),
}));

vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

import { toastError, toastSuccess } from "@/shared/lib/toast";

describe("PresetChips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders every preset from usePresets() as a chip", () => {
    render(<PresetChips nominationId="n1" />);
    expect(screen.getByRole("button", { name: "Группы → Плейофф-8" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Только плейофф-16" })).toBeInTheDocument();
  });

  it("first click arms the chip without applying anything (AC-16)", () => {
    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: "Группы → Плейофф-8" }));

    expect(screen.getByRole("button", { name: "Заменить схему?" })).toBeInTheDocument();
    expect(applyMutate).not.toHaveBeenCalled();
  });

  it("second click on the armed chip applies the preset (AC-16)", () => {
    render(<PresetChips nominationId="n1" />);
    const chip = screen.getByRole("button", { name: "Группы → Плейофф-8" });
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: "Заменить схему?" }));

    expect(applyMutate).toHaveBeenCalledTimes(1);
    expect(applyMutate).toHaveBeenCalledWith({ presetId: "p1" }, expect.anything());
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("clicking a different chip while one is armed disarms the first and arms the second", () => {
    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: "Группы → Плейофф-8" }));
    fireEvent.click(screen.getByRole("button", { name: "Только плейофф-16" }));

    expect(screen.getByRole("button", { name: "Группы → Плейофф-8" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Заменить схему?" })).toBeInTheDocument();
    expect(applyMutate).not.toHaveBeenCalled();
  });

  it("shows an error toast with the presetErrorMessage text when applying a touched schema fails (409)", () => {
    applyMutate.mockImplementationOnce((_vars, opts?: { onError?: (err: Error) => void }) => {
      opts?.onError?.(new Error("Схема номинации уже тронута — формат можно применить только к пустой схеме"));
    });

    render(<PresetChips nominationId="n1" />);
    const chip = screen.getByRole("button", { name: "Группы → Плейофф-8" });
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: "Заменить схему?" }));

    expect(toastError).toHaveBeenCalledWith(
      "Схема номинации уже тронута — формат можно применить только к пустой схеме",
    );
  });

  it("opens an autofocused inline field when 'Сохранить как пресет' is clicked", () => {
    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить как пресет/i }));

    const input = screen.getByLabelText(/Имя пресета/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("Enter in the inline field saves the preset via useSavePreset", () => {
    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить как пресет/i }));
    fireEvent.change(screen.getByLabelText(/Имя пресета/i), { target: { value: "Новый пресет" } });
    fireEvent.keyDown(screen.getByLabelText(/Имя пресета/i), { key: "Enter" });

    expect(saveMutate).toHaveBeenCalledWith(
      { name: "Новый пресет", nominationId: "n1" },
      expect.anything(),
    );
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("the confirm button saves the preset the same way as Enter", () => {
    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить как пресет/i }));
    fireEvent.change(screen.getByLabelText(/Имя пресета/i), { target: { value: "Новый пресет" } });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить пресет/i }));

    expect(saveMutate).toHaveBeenCalledWith(
      { name: "Новый пресет", nominationId: "n1" },
      expect.anything(),
    );
  });

  it("Enter with an empty name closes the field without calling the mutation", () => {
    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить как пресет/i }));
    fireEvent.keyDown(screen.getByLabelText(/Имя пресета/i), { key: "Enter" });

    expect(saveMutate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Имя пресета/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Сохранить как пресет/i })).toBeInTheDocument();
  });

  it("after a successful save the field closes and a success toast is shown (AC-17)", () => {
    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить как пресет/i }));
    fireEvent.change(screen.getByLabelText(/Имя пресета/i), { target: { value: "Новый пресет" } });
    fireEvent.keyDown(screen.getByLabelText(/Имя пресета/i), { key: "Enter" });

    expect(screen.queryByLabelText(/Имя пресета/i)).not.toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("on a 409 (name taken) the field stays open and an error toast is shown (AC-17)", () => {
    saveMutate.mockImplementationOnce((_vars, opts?: { onError?: (err: Error) => void }) => {
      opts?.onError?.(new Error("Пресет с таким именем уже есть — выберите другое"));
    });

    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить как пресет/i }));
    fireEvent.change(screen.getByLabelText(/Имя пресета/i), { target: { value: "Дубль" } });
    fireEvent.keyDown(screen.getByLabelText(/Имя пресета/i), { key: "Enter" });

    expect(toastError).toHaveBeenCalledWith("Пресет с таким именем уже есть — выберите другое");
    expect(screen.getByLabelText(/Имя пресета/i)).toBeInTheDocument();
  });

  it("never renders a persistent Alert banner — feedback is toast-only (rule 0023)", () => {
    saveMutate.mockImplementationOnce((_vars, opts?: { onError?: (err: Error) => void }) => {
      opts?.onError?.(new Error("Пресет с таким именем уже есть — выберите другое"));
    });
    applyMutate.mockImplementationOnce((_vars, opts?: { onError?: (err: Error) => void }) => {
      opts?.onError?.(new Error("Схема номинации уже тронута"));
    });

    render(<PresetChips nominationId="n1" />);
    fireEvent.click(screen.getByRole("button", { name: "Группы → Плейофф-8" }));
    fireEvent.click(screen.getByRole("button", { name: "Заменить схему?" }));
    fireEvent.click(screen.getByRole("button", { name: /Сохранить как пресет/i }));
    fireEvent.change(screen.getByLabelText(/Имя пресета/i), { target: { value: "x" } });
    fireEvent.keyDown(screen.getByLabelText(/Имя пресета/i), { key: "Enter" });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
