// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleScreen } from "./console-screen";
import { emptyConsoleSnapshot } from "@/entities/tournament-console/lib/types";
import type { TournamentConsoleSnapshotDto } from "@/entities/tournament-console/lib/types";

class FakeEventSource {
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
}

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
    expect(screen.getByText("Всё в порядке — сигналов нет.")).toBeInTheDocument();
    expect(screen.getByText("В турнире нет активных площадок.")).toBeInTheDocument();
    expect(screen.getByText("Очередь пуста.")).toBeInTheDocument();
  });

  it("рендерит площадки, номинации и очередь из снапшота", () => {
    const snapshot: TournamentConsoleSnapshotDto = {
      ...emptyConsoleSnapshot("t1"),
      arenas: [
        {
          arenaId: "a1",
          arenaName: "Ристалище 1",
          position: 1,
          idleState: "waiting_first_pool",
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
        },
      ],
      nominations: [
        {
          nominationId: "n1",
          title: "Длинный меч",
          position: 1,
          phase: "running",
          currentStageTitle: "Группа A",
          boutTotal: 5,
          boutFinished: 1,
          boutRemainingUnseated: 0,
          expectedFinishAt: null,
          provisional: false,
        },
      ],
      queue: [],
      alerts: [],
    };
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshot} />);
    expect(screen.getByText("Ристалище 1")).toBeInTheDocument();
    expect(screen.getByText("Длинный меч")).toBeInTheDocument();
  });

  it("пульт ничего не мутирует — только ссылки на другие экраны (AC-9)", () => {
    const snapshot: TournamentConsoleSnapshotDto = {
      ...emptyConsoleSnapshot("t1"),
      arenas: [
        {
          arenaId: "a1",
          arenaName: "Ристалище 1",
          position: 1,
          idleState: "waiting_first_pool",
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
        },
      ],
    };
    render(<ConsoleScreen tournamentId="t1" initialSnapshot={snapshot} />);
    // Нет ни одной кнопки — только заголовок, текст и ссылки (переходы).
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
