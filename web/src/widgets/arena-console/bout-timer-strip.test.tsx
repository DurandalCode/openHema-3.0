// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});

const controls = { start: vi.fn(), pause: vi.fn(), reset: vi.fn(), adjust: vi.fn() };

function renderStrip(
  status: "STOPPED" | "RUNNING" | "PAUSED" | "EXPIRED" = "STOPPED",
  roundNumber: number | null = 2,
  boutState: "BOUT_STATE_NOT_STARTED" | "BOUT_STATE_IN_PROGRESS" = "BOUT_STATE_IN_PROGRESS",
) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BoutTimerStrip
        arenaId="arena-1"
        poolId="pool-1"
        boutState={boutState}
        roundNumber={roundNumber}
        display={{ status, remainingCs: 9000 }}
        controls={controls}
      >
        <div>Содержимое листа действий</div>
      </BoutTimerStrip>
    </QueryClientProvider>,
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

  it("starts a not-started bout before starting the mobile timer", async () => {
    let finishRequest!: (value: { ok: boolean; json: () => Promise<object> }) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finishRequest = resolve; })));
    renderStrip("STOPPED", 2, "BOUT_STATE_NOT_STARTED");

    fireEvent.click(screen.getByRole("button", { name: "Старт" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/pools/pool-1/bout",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "start" }) }),
    ));
    expect(controls.start).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Старт" })).toBeDisabled();

    finishRequest({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(controls.start).toHaveBeenCalledTimes(1));
  });

  it("keeps the timer stopped when the bout start is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "Бой нельзя начать" }),
    })));
    renderStrip("STOPPED", 2, "BOUT_STATE_NOT_STARTED");

    fireEvent.click(screen.getByRole("button", { name: "Старт" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Старт" })).toBeEnabled());
    expect(controls.start).not.toHaveBeenCalled();
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
