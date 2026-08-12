// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов, которых jsdom не реализует (см. паттерн в
 * `features/stage-management/ui/create-stage-dialog.test.tsx`).
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

function renderDialog(onOpenChange?: (open: boolean) => void) {
  render(
    <Dialog defaultOpen onOpenChange={onOpenChange}>
      <DialogTrigger>Открыть</DialogTrigger>
      <DialogContent>
        <DialogTitle>Заголовок</DialogTitle>
        <DialogDescription>Описание диалога</DialogDescription>
        <button type="button">Первая кнопка</button>
        <button type="button">Вторая кнопка</button>
      </DialogContent>
    </Dialog>,
  );
}

describe("Dialog (AC-3)", () => {
  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on outside click (overlay)", async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    screen.getByRole("dialog");
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).toBeInTheDocument();

    // `DismissableLayer` регистрирует свой pointerdown-листенер асинхронно
    // (setTimeout 0), чтобы не поймать тот же клик, которым диалог был
    // открыт — дожидаемся этого тика перед кликом вне контента.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Radix определяет "outside" через pointerdown+click вне контента.
    fireEvent.pointerDown(overlay as Element, { button: 0 });
    fireEvent.click(overlay as Element);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps focus inside the dialog while tabbing", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Прогоняем Tab несколько раз (больше, чем фокусируемых элементов
    // внутри), чтобы убедиться, что фокус зациклился и не ушёл наружу.
    for (let i = 0; i < 6; i += 1) {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Tab",
        code: "Tab",
      });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
