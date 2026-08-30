// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleScreen } from "./console-screen";
import { emptyConsoleSnapshot } from "@/entities/tournament-console/lib/types";
import type { TournamentConsoleSnapshotDto } from "@/entities/tournament-console/lib/types";

class FakeEventSource {
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
}

const ARENA_1 = {
  arenaId: "a1",
  arenaName: "Ристалище 1",
  position: 1,
  idleState: "waiting_first_pool" as const,
  freeSince: null,
  nominationId: "",
  nominationName: "",
  stageTitle: "",
  poolId: "",
  poolName: "",
  currentBout: null,
  boutTotal: 0,
  boutFinished: 0,
  pace: null,
  poolExpectedFinishAt: null,
};

const NOMINATION_1 = {
  nominationId: "n1",
  title: "Длинный меч",
  position: 1,
  phase: "running" as const,
  currentStageTitle: "Группа A",
  boutTotal: 5,
  boutFinished: 1,
  boutRemainingUnseated: 0,
  expectedFinishAt: null,
  provisional: false,
};

describe("ConsoleScreen (спека 0043)", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("рендерит SSR-снапшот пустого турнира без падения", () => {
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={emptyConsoleSnapshot("t1")} />);
    expect(screen.getByText("Пульт")).toBeInTheDocument();
    // Присутствует и в компактном мобильном виде, и в полном десктопном
    // (спека 0045 — оба варианта в DOM всегда, видимость по md:-классам).
    expect(screen.getAllByText("Всё в порядке — сигналов нет.")).toHaveLength(2);
    expect(screen.getAllByText("В турнире нет активных площадок.")).toHaveLength(2);
    // Вкладка «Очередь» на телефоне не активна по умолчанию — не смонтирована
    // (Radix Tabs), поэтому в десктопной раскладке текст один.
    expect(screen.getByText("Очередь пуста.")).toBeInTheDocument();
  });

  it("рендерит площадки, номинации и очередь из снапшота", () => {
    const snapshot: TournamentConsoleSnapshotDto = {
      ...emptyConsoleSnapshot("t1"),
      arenas: [ARENA_1],
      nominations: [NOMINATION_1],
      queue: [],
      alerts: [],
    };
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshot} />);
    // «Площадки» — вкладка по умолчанию активна на телефоне, поэтому
    // площадка видна и там, и в десктопной раскладке.
    expect(screen.getAllByText("Ристалище 1")).toHaveLength(2);
    // «Номинации» — не активная по умолчанию вкладка на телефоне (не
    // смонтирована), поэтому номинация видна только в десктопной раскладке.
    expect(screen.getByText("Длинный меч")).toBeInTheDocument();
  });

  it("пульт ничего не мутирует — только ссылки на другие экраны (AC-9)", () => {
    const snapshot: TournamentConsoleSnapshotDto = {
      ...emptyConsoleSnapshot("t1"),
      arenas: [ARENA_1],
    };
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshot} />);
    // Нет ни одной кнопки — только заголовок, текст и ссылки (переходы).
    // TabsTrigger — role="tab", не "button", поэтому вкладки сюда не попадают.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

/**
 * Мобильные вкладки «Пульта» (спека 0045, T10, FR-11/FR-14/AC-5) и
 * регрессия планшетной/десктопной раскладки без вкладок (T12, FR-15/AC-7).
 */
describe("ConsoleScreen — мобильные вкладки и раскладка планшета (спека 0045)", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  function snapshotWithData(): TournamentConsoleSnapshotDto {
    return {
      ...emptyConsoleSnapshot("t1"),
      arenas: [ARENA_1, { ...ARENA_1, arenaId: "a2", arenaName: "Ристалище 2" }],
      nominations: [NOMINATION_1],
      queue: [
        {
          poolId: "p1",
          nominationId: "n1",
          nominationName: "Длинный меч",
          poolName: "Пул Финал",
          stageTitle: "",
          boutCount: 3,
          estimatedSeconds: 600,
        },
      ],
      alerts: [],
    };
  }

  it("T10: мобильный блок — вкладки со счётчиками из snapshot", () => {
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshotWithData()} />);
    const mobile = within(screen.getByTestId("console-mobile"));

    expect(mobile.getByRole("tab", { name: "Площадки · 2" })).toBeInTheDocument();
    expect(mobile.getByRole("tab", { name: "Номинации · 1" })).toBeInTheDocument();
    expect(mobile.getByRole("tab", { name: "Очередь · 1" })).toBeInTheDocument();
  });

  it("T10: переключение вкладки меняет видимый TabsContent", () => {
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshotWithData()} />);
    const mobile = within(screen.getByTestId("console-mobile"));

    // По умолчанию активна вкладка «Площадки».
    expect(mobile.getByText("Ристалище 1")).toBeInTheDocument();
    expect(mobile.queryByText("Длинный меч")).not.toBeInTheDocument();

    // Radix `Tabs.Trigger` переключает значение по `mousedown` (не `click`,
    // см. `@radix-ui/react-tabs`), поэтому здесь — `fireEvent.mouseDown`.
    fireEvent.mouseDown(mobile.getByRole("tab", { name: "Номинации · 1" }));

    expect(mobile.getByText("Длинный меч")).toBeInTheDocument();
    expect(mobile.queryByText("Ристалище 1")).not.toBeInTheDocument();

    fireEvent.mouseDown(mobile.getByRole("tab", { name: "Очередь · 1" }));

    expect(mobile.getByText("Пул Финал", { exact: false })).toBeInTheDocument();
  });

  it("T10 (FR-14): карточки площадок в мобильной вкладке — одна колонка (grid-cols-1, без sm:/xl:)", () => {
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshotWithData()} />);
    const mobile = within(screen.getByTestId("console-mobile"));
    const grid = mobile.getByTestId("arenas-grid");

    expect(grid.className).toMatch(/(?:^|\s)grid-cols-1(?:\s|$)/);
    expect(grid.className).not.toMatch(/sm:grid-cols-2/);
    expect(grid.className).not.toMatch(/xl:grid-cols-3/);
  });

  it("T12: десктопный блок — все три раздела одновременно, без вкладок (регрессия)", () => {
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshotWithData()} />);
    const desktop = within(screen.getByTestId("console-desktop"));

    expect(desktop.getByText("Ристалище 1")).toBeInTheDocument();
    expect(desktop.getByText("Ристалище 2")).toBeInTheDocument();
    expect(desktop.getByText("Длинный меч")).toBeInTheDocument();
    expect(desktop.getByText("Пул Финал", { exact: false })).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(3); // все три — из мобильного блока, не из десктопного
    expect(desktop.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("T12 (FR-14 регрессия): карточки площадок на десктопе остаются сеткой из нескольких колонок", () => {
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshotWithData()} />);
    const desktop = within(screen.getByTestId("console-desktop"));
    const grid = desktop.getByTestId("arenas-grid");

    expect(grid.className).toMatch(/sm:grid-cols-2/);
    expect(grid.className).toMatch(/xl:grid-cols-3/);
  });
});
