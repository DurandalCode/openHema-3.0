// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "./input";

/**
 * AC-2: контролируемый ввод текста реально меняет `value` и вызывает
 * `onChange` — не декоративная вёрстка (см. plan.md: `UiField` в исходном
 * дизайне нефункционален, здесь — настоящий контролируемый компонент).
 */
function ControlledInput({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <Input
      aria-label="Имя"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange?.(e.target.value);
      }}
    />
  );
}

describe("Input", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("реально меняет value и вызывает onChange при вводе текста", () => {
    const onChange = vi.fn();
    render(<ControlledInput onChange={onChange} />);

    const input = screen.getByRole("textbox", { name: "Имя" }) as HTMLInputElement;
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "Иван" } });

    expect(onChange).toHaveBeenCalledWith("Иван");
    expect(input.value).toBe("Иван");
  });

  it("отражает aria-invalid, переданный вызывающим кодом (invalid-состояние поля)", () => {
    render(<Input aria-label="Email" aria-invalid />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
