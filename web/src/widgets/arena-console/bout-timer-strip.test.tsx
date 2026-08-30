// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BoutTimerStrip } from "./bout-timer-strip";

/**
 * Radix `Dialog`/`FocusScope` (используется `Sheet` внутри) в jsdom требуют
 * pointer-capture/scrollIntoView полифиллов, которых jsdom не реализует
 * (см. `shared/ui/sheet.test.tsx`).
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

beforeEach(() => {
  vi.clearAllMocks();
});

const controls = { start: vi.fn(), pause: vi.fn(), reset: vi.fn(), adjust: vi.fn() };

function renderStrip(status: "STOPPED" | "RUNNING" | "PAUSED" | "EXPIRED" = "STOPPED", roundNumber: number | null = 2) {
  return render(
    <BoutTimerStrip
      roundNumber={roundNumber}
      display={{ status, remainingCs: 9000 }}
      controls={controls}
    >
      <div>Содержимое листа действий</div>
    </BoutTimerStrip>,
  );
}

describe("BoutTimerStrip (спека 0045, T4/FR-4)", () => {
  it("renders the round number and the timer", () => {
    renderStrip("STOPPED", 3);
    expect(screen.getByText("Раунд 3")).toBeInTheDocument();
    expect(document.querySelector('[data-timer-status="STOPPED"]')).toBeInTheDocument();
  });

  it("shows Старт and calls controls.start when stopped", () => {
    renderStrip("STOPPED");
    const button = screen.getByRole("button", { name: "Старт" });
    fireEvent.click(button);
    expect(controls.start).toHaveBeenCalledTimes(1);
    expect(controls.pause).not.toHaveBeenCalled();
  });

  it("shows Пауза and calls controls.pause when running", () => {
    renderStrip("RUNNING");
    const button = screen.getByRole("button", { name: "Пауза" });
    fireEvent.click(button);
    expect(controls.pause).toHaveBeenCalledTimes(1);
    expect(controls.start).not.toHaveBeenCalled();
  });

  it("the ⋯ button is reachable via role/name and keyboard-focusable", () => {
    renderStrip();
    const moreButton = screen.getByRole("button", { name: "Дополнительные действия" });
    moreButton.focus();
    expect(moreButton).toHaveFocus();
  });

  it("does not render the sheet content until ⋯ is opened", () => {
    renderStrip();
    expect(screen.queryByText("Содержимое листа действий")).not.toBeInTheDocument();
  });

  it("opens the sheet with the provided children on ⋯ click", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Дополнительные действия" }));
    expect(screen.getByText("Содержимое листа действий")).toBeInTheDocument();
  });

  it("omits the round label when roundNumber is null", () => {
    renderStrip("STOPPED", null);
    expect(screen.queryByText(/^Раунд/)).not.toBeInTheDocument();
  });
});
