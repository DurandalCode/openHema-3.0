// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardBout } from "@/entities/pool/lib/types";
import { BoutActionsSheetContent } from "./bout-actions-sheet";

const controls = { start: vi.fn(), pause: vi.fn(), reset: vi.fn(), adjust: vi.fn() };

function fighter(id: string, name: string) {
  return { fighterId: id, name, club: "" };
}

function bout(overrides: Partial<BoardBout> = {}): BoardBout {
  return {
    id: "bout-2",
    roundNumber: 1,
    sequenceNumber: 8,
    fighterA: fighter("f3", "Соколов"),
    fighterB: fighter("f4", "Берг"),
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    ...overrides,
  };
}

function renderSheet(overrides: Partial<React.ComponentProps<typeof BoutActionsSheetContent>> = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onUndo = vi.fn();
  const onReset = vi.fn();
  const onReopen = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <BoutActionsSheetContent
        arenaId="a1"
        upNext={bout()}
        controls={controls}
        sidesSwapped={false}
        defaultDurationSeconds={90}
        undoLabel={null}
        onUndo={onUndo}
        canReset
        onReset={onReset}
        canReopen={false}
        onReopen={onReopen}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onUndo, onReset, onReopen };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});

describe("BoutActionsSheetContent (спека 0045, T5/FR-5)", () => {
  it("shows a preview of the next bout of the pool", () => {
    renderSheet();
    expect(screen.getByText(/Далее: Соколов — Берг/)).toBeInTheDocument();
  });

  it("shows 'last bout' when there is no next bout", () => {
    renderSheet({ upNext: null });
    expect(screen.getByText("Последний бой пула")).toBeInTheDocument();
  });

  it("±seconds buttons call controls.adjust with the signed amount", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "+3с" }));
    expect(controls.adjust).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "−2с" }));
    expect(controls.adjust).toHaveBeenCalledWith(-2);
  });

  it("swaps sides via POST /scoreboard-sides and shows the arena default duration", async () => {
    renderSheet();
    expect(screen.getByText("Длительность: 90с")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Поменять стороны" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/arenas/a1/scoreboard-sides",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ swapped: true }) }),
      ),
    );
  });

  it("hides the undo button when there is nothing to undo", () => {
    renderSheet({ undoLabel: null });
    expect(screen.queryByRole("button", { name: /Отменить/ })).not.toBeInTheDocument();
  });

  it("shows the undo button with the given label and calls onUndo", () => {
    const { onUndo } = renderSheet({ undoLabel: "Отменить +2 красному" });
    fireEvent.click(screen.getByRole("button", { name: "Отменить +2 красному" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("Сбросить бой calls onReset when enabled", () => {
    const { onReset } = renderSheet({ canReset: true });
    fireEvent.click(screen.getByRole("button", { name: "Сбросить бой" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("Сбросить бой is disabled when canReset is false", () => {
    renderSheet({ canReset: false });
    expect(screen.getByRole("button", { name: "Сбросить бой" })).toBeDisabled();
  });

  it("Переоткрыть is disabled with an explanatory title when the bout is not finished", () => {
    renderSheet({ canReopen: false });
    const button = screen.getByRole("button", { name: "Переоткрыть" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Бой ещё не завершён");
  });

  it("Переоткрыть is enabled and calls onReopen when the bout is finished", () => {
    const { onReopen } = renderSheet({ canReopen: true });
    const button = screen.getByRole("button", { name: "Переоткрыть" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it("renders a link to the arena scoreboard", () => {
    renderSheet();
    expect(screen.getByRole("link", { name: "Открыть табло" })).toHaveAttribute(
      "href",
      "/admin/arenas/a1/scoreboard",
    );
  });
});
