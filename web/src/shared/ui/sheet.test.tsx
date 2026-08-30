// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов, которых jsdom не реализует (см. `shared/ui/dialog.test.tsx`).
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

function renderSheet(onOpenChange?: (open: boolean) => void) {
  render(
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger>Открыть</SheetTrigger>
      <SheetContent>
        <SheetTitle>Заголовок листа</SheetTitle>
        <button type="button">Пункт действия</button>
      </SheetContent>
    </Sheet>,
  );
}

describe("Sheet (0045, T1)", () => {
  it("is not in the DOM while closed", () => {
    renderSheet();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Заголовок листа")).not.toBeInTheDocument();
  });

  it("opens on trigger click", () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Пункт действия")).toBeInTheDocument();
  });

  it("renders content anchored to the bottom edge", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));

    const content = screen.getByRole("dialog");
    expect(content.className).toMatch(/(?:^|\s)inset-x-0(?:\s|$)/);
    expect(content.className).toMatch(/(?:^|\s)bottom-0(?:\s|$)/);
    expect(content.className).toMatch(/(?:^|\s)rounded-t-xl(?:\s|$)/);
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    renderSheet(onOpenChange);
    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on outside click (overlay)", async () => {
    const onOpenChange = vi.fn();
    renderSheet(onOpenChange);
    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));

    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).toBeInTheDocument();

    // DismissableLayer регистрирует pointerdown-листенер асинхронно (см.
    // тот же паттерн в `dialog.test.tsx`).
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.pointerDown(overlay as Element, { button: 0 });
    fireEvent.click(overlay as Element);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps focus inside while tabbing", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));

    const content = screen.getByRole("dialog");
    expect(content.contains(document.activeElement)).toBe(true);

    for (let i = 0; i < 4; i += 1) {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Tab",
        code: "Tab",
      });
      expect(content.contains(document.activeElement)).toBe(true);
    }
  });
});
