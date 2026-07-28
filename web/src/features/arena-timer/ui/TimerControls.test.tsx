// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimerControls } from "./TimerControls";
import type { ArenaLiveSnapshotDto } from "@/entities/arena-live/lib/types";

const controls = {
  start: vi.fn(),
  pause: vi.fn(),
  reset: vi.fn(),
  adjust: vi.fn(),
};

const snapshot: ArenaLiveSnapshotDto = {
  board: null,
  timer: { status: "TIMER_STATUS_STOPPED", remainingCs: 9000, sampledUnixMs: "0", defaultCs: 9000 },
  room: { scoreboardCount: 1, thisOrdinal: 0, thisIsSource: false, sidesSwapped: false },
  defaultDurationSeconds: 90,
  serverNowUnixMs: "0",
};

vi.mock("@/features/arena-live/api/use-arena-live", () => ({
  useArenaLive: vi.fn(() => ({ snapshot, serverOffsetMs: 0, onCommand: () => () => {} })),
}));
vi.mock("@/features/arena-timer/api/use-arena-timer", () => ({
  useArenaTimer: vi.fn(() => ({
    display: { status: "STOPPED", remainingCs: 9000 },
    controls,
  })),
}));

function renderControls() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TimerControls arenaId="a1" />
    </QueryClientProvider>,
  );
}

describe("TimerControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  afterEach(() => {
    cleanup();
  });

  it("start/pause/reset buttons call the corresponding controls.* function", () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Старт" }));
    expect(controls.start).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Пауза" }));
    expect(controls.pause).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Сброс" }));
    expect(controls.reset).toHaveBeenCalledTimes(1);
  });

  it("±N buttons call controls.adjust with the signed amount", () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "+3с" }));
    expect(controls.adjust).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: "−2с" }));
    expect(controls.adjust).toHaveBeenCalledWith(-2);
  });

  it("sets the default duration via PUT /default-duration", async () => {
    renderControls();

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Задать" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/arenas/a1/default-duration",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ defaultDurationSeconds: 120 }),
        }),
      ),
    );
  });

  it("toggles sides via POST /scoreboard-sides with the negated current value", async () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Поменять стороны" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/arenas/a1/scoreboard-sides",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ swapped: true }),
        }),
      ),
    );
  });
});
