// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/**
 * Radix `Select` нуждается в `scrollIntoView`/pointer-capture, которых нет в
 * jsdom (паттерн — см. `create-stage-dialog.test.tsx`,
 * `apply-format-dialog.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

/**
 * AC-2: выбор опции в контролируемом Select реально меняет отображаемое
 * значение и вызывает `onValueChange` — не декоративная вёрстка.
 */
function ControlledSelect({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onValueChange?.(v);
      }}
    >
      <SelectTrigger aria-label="Формат">
        <SelectValue placeholder="Выберите" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pool">Группы</SelectItem>
        <SelectItem value="bracket">Сетка</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("реально меняет отображаемое значение и вызывает onValueChange при выборе опции", () => {
    const onValueChange = vi.fn();
    render(<ControlledSelect onValueChange={onValueChange} />);

    const trigger = screen.getByRole("combobox", { name: "Формат" });
    expect(trigger).toHaveTextContent("Выберите");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("Сетка"));

    expect(onValueChange).toHaveBeenCalledWith("bracket");
    expect(trigger).toHaveTextContent("Сетка");
  });
});
