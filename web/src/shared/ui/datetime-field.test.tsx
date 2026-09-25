// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DateTimeField } from "./datetime-field";

/**
 * Radix `Popover` в jsdom нуждается в тех же polyfill'ах, что `Dialog`/
 * `Select` (см. `dialog.test.tsx`, `select.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

describe("DateTimeField (AC-12)", () => {
  it("exposes a field-level error on the trigger", () => {
    render(
      <DateTimeField
        value={null}
        onChange={vi.fn()}
        invalid
        describedBy="date-range-error"
      />,
    );
    expect(screen.getByRole("button", { name: "Выбрать дату" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Выбрать дату" })).toHaveAttribute(
      "aria-describedby",
      "date-range-error",
    );
  });

  it("displays the controlled value", () => {
    render(
      <DateTimeField value="2026-08-12T10:00:00.000Z" onChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /12\.08\.2026/ })).toBeInTheDocument();
  });

  it("shows a placeholder when the value is empty", () => {
    render(<DateTimeField value={null} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Выбрать дату" }),
    ).toBeInTheDocument();
  });

  it("calls onChange with an ISO string when a day is picked (AC-12)", async () => {
    const onChange = vi.fn();
    render(
      <DateTimeField value="2026-08-12T00:00:00.000Z" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /12\.08\.2026/ }));

    const dayButton = await screen.findByRole("button", { name: "20" });
    fireEvent.click(dayButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    const iso = onChange.mock.calls[0][0] as string;
    const date = new Date(iso);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(20);
  });

  it("preserves the time-of-day when withTime and only the date changes", async () => {
    const onChange = vi.fn();
    render(
      <DateTimeField
        value="2026-08-12T14:30:00.000Z"
        onChange={onChange}
        withTime
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /12\.08\.2026/ }));
    const dayButton = await screen.findByRole("button", { name: "20" });
    fireEvent.click(dayButton);

    const iso = onChange.mock.calls[0][0] as string;
    const date = new Date(iso);
    expect(date.getDate()).toBe(20);
    expect(date.getHours()).toBe(new Date("2026-08-12T14:30:00.000Z").getHours());
    expect(date.getMinutes()).toBe(30);
  });

  // Спека 0023, T23: необязательная дата (напр. окончания турнира) должна
  // быть очищаемой — иначе однодневный турнир нельзя было бы задать после
  // случайного выбора даты окончания.
  it("clears the value via the clear button when clearable", async () => {
    const onChange = vi.fn();
    render(
      <DateTimeField value="2026-08-12T00:00:00.000Z" onChange={onChange} clearable />,
    );

    fireEvent.click(screen.getByRole("button", { name: /12\.08\.2026/ }));
    const clearButton = await screen.findByRole("button", { name: "Очистить" });
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("does not show a clear button when not clearable", () => {
    render(
      <DateTimeField value="2026-08-12T00:00:00.000Z" onChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /12\.08\.2026/ }));
    expect(screen.queryByRole("button", { name: "Очистить" })).not.toBeInTheDocument();
  });
});
