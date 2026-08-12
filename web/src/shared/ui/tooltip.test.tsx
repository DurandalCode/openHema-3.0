// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Tooltip } from "./tooltip";

/**
 * Radix `Tooltip`/`Popper` в jsdom нуждаются в polyfill'ах, которых jsdom не
 * реализует (паттерн — см. `dialog.test.tsx`, `select.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  if (!("ResizeObserver" in window)) {
    // @ts-expect-error - минимальный polyfill для jsdom
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  cleanup();
});

describe("Tooltip (AC-9)", () => {
  it("reveals the hint on keyboard focus, without any mouse interaction", async () => {
    render(
      <Tooltip content="Правило подсчёта мест">
        <button type="button">?</button>
      </Tooltip>,
    );

    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(screen.getByRole("button", { name: "?" }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Правило подсчёта мест");
  });

  it("hides the hint again on blur", async () => {
    render(
      <Tooltip content="Пояснение">
        <button type="button">?</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "?" });
    fireEvent.focus(trigger);
    await screen.findByRole("tooltip");

    fireEvent.blur(trigger);

    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
