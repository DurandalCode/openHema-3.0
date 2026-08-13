// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";

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

describe("ConfirmDialog (AC-7, AC-8)", () => {
  it("без confirmWord подтверждение активно сразу и вызывает onConfirm", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Сбросить раскладку пулов?"
        consequences="Будут удалены 4 боя и состав из 8 бойцов."
        confirmLabel="Сбросить"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Сбросить" });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("с confirmWord подтверждение заблокировано до точного совпадения ввода", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Удалить номинацию «Лонгсорд соло»?"
        consequences="Действие необратимо: будут удалены все этапы и заявки."
        confirmLabel="Удалить"
        confirmWord="Лонгсорд соло"
        destructive
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Удалить" });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Лонгсорд" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "Лонгсорд соло" } });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("отмена не вызывает onConfirm", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Сбросить раскладку пулов?"
        consequences="Будут удалены 4 боя и состав из 8 бойцов."
        confirmLabel="Сбросить"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
