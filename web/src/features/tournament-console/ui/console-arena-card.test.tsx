// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConsoleArenaCard } from "./console-arena-card";
import type { ConsoleArena } from "@/entities/tournament-console/lib/types";

function baseArena(overrides: Partial<ConsoleArena> = {}): ConsoleArena {
  return {
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
    ...overrides,
  };
}

describe("ConsoleArenaCard (спека 0043)", () => {
  afterEach(() => {
    cleanup();
  });

  it("AC-16: «Ждёт первый пул» без счётчика простоя", () => {
    render(<ConsoleArenaCard arena={baseArena({ idleState: "waiting_first_pool" })} />);
    expect(screen.getByText("Ждёт первый пул")).toBeInTheDocument();
  });

  it("AC-17: «Свободна · N мин» с freeSince", () => {
    const now = new Date(2026, 7, 29, 12, 0, 0);
    const freeSince = new Date(2026, 7, 29, 11, 48, 0).toISOString();
    render(<ConsoleArenaCard arena={baseArena({ idleState: "free", freeSince })} now={now} />);
    expect(screen.getByText("Свободна · 12 мин")).toBeInTheDocument();
  });

  it("занятая площадка показывает пул, идущий бой и счёт", () => {
    render(
      <ConsoleArenaCard
        arena={baseArena({
          idleState: "occupied",
          nominationName: "Длинный меч",
          poolName: "Пул A",
          boutTotal: 5,
          boutFinished: 2,
          currentBout: {
            id: "b1",
            roundNumber: 1,
            sequenceNumber: 3,
            fighterA: { fighterId: "f1", name: "Иванов", club: "" },
            fighterB: { fighterId: "f2", name: "Петров", club: "" },
            state: "BOUT_STATE_IN_PROGRESS",
            scoreA: 4,
            scoreB: 2,
          },
        })}
      />,
    );
    expect(screen.getByText("Иванов — Петров")).toBeInTheDocument();
    expect(screen.getByText("4:2")).toBeInTheDocument();
    expect(screen.getByText(/Длинный меч/)).toBeInTheDocument();
    expect(screen.queryByText("Ждёт первый пул")).not.toBeInTheDocument();
  });

  it("ссылка ведёт на страницу площадки", () => {
    render(<ConsoleArenaCard arena={baseArena({ arenaId: "a42" })} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/arenas/a42");
  });

  it("показывает прогноз завершения пула, когда он задан", () => {
    const now = new Date(2026, 7, 29, 11, 0, 0);
    render(
      <ConsoleArenaCard
        arena={baseArena({
          idleState: "occupied",
          poolExpectedFinishAt: new Date(2026, 7, 29, 11, 20, 0).toISOString(),
          pace: { tickSeconds: 180, sampleCount: 5, provisional: false },
        })}
        now={now}
      />,
    );
    expect(screen.getByText("ориентировочно 11:20 · через ~20 минут")).toBeInTheDocument();
  });
});
