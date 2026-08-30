// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ArenaCard } from "./arena-card";
import type { LiveArenaDto } from "@/entities/tournament-live/lib/types";

function arena(overrides: Partial<LiveArenaDto> = {}): LiveArenaDto {
  return {
    arenaId: "a1",
    arenaName: "Арена 1",
    position: 0,
    state: "free",
    nominationId: "",
    nominationName: "",
    poolName: "",
    stageTitle: "",
    currentBout: null,
    poolBoutTotal: 0,
    poolBoutFinished: 0,
    ...overrides,
  };
}

const bout: NonNullable<LiveArenaDto["currentBout"]> = {
  boutId: "b1",
  nominationId: "n1",
  nominationName: "Длинный меч",
  stageTitle: "Группа A",
  poolName: "Пул A",
  arenaId: "a1",
  arenaName: "Арена 1",
  sequenceNumber: 3,
  poolBoutTotal: 6,
  fighterA: { fighterId: "f1", name: "Иванов", club: "Сокол" },
  fighterB: { fighterId: "f2", name: "Петров", club: "Беркут" },
  state: "BOUT_STATE_IN_PROGRESS",
  scoreA: 4,
  scoreB: 2,
  startedAt: "2026-08-22T11:02:00Z",
  finishedAt: null,
};

describe("widgets/home ArenaCard (spec 0034, FR-14, AC-7..AC-9)", () => {
  afterEach(cleanup);

  it("shows both fighters, clubs, score, nomination+stage+pool for bout_in_progress (AC-7)", () => {
    render(
      <ArenaCard
        arena={arena({
          state: "bout_in_progress",
          nominationName: "Длинный меч",
          stageTitle: "Группа A",
          poolName: "Пул A",
          currentBout: bout,
        })}
      />,
    );
    expect(screen.getByText("идёт бой")).toBeInTheDocument();
    expect(screen.getByText("Иванов")).toBeInTheDocument();
    expect(screen.getByText("Петров")).toBeInTheDocument();
    expect(screen.getByText("(Сокол)")).toBeInTheDocument();
    expect(screen.getByText("(Беркут)")).toBeInTheDocument();
    expect(screen.getByText("4:2")).toBeInTheDocument();
    expect(screen.getByText("Длинный меч · Группа A · Пул A")).toBeInTheDocument();
    expect(screen.getByText("Бой 3 из 6")).toBeInTheDocument();
  });

  it("shows the first unplayed pair without a score for preparing (AC-8)", () => {
    render(
      <ArenaCard
        arena={arena({
          state: "preparing",
          nominationName: "Длинный меч",
          stageTitle: "Группа A",
          poolName: "Пул A",
          currentBout: { ...bout, state: "BOUT_STATE_NOT_STARTED", scoreA: 0, scoreB: 0 },
        })}
      />,
    );
    expect(screen.getByText("готовится")).toBeInTheDocument();
    expect(screen.getByText("Иванов")).toBeInTheDocument();
    expect(screen.getByText("Петров")).toBeInTheDocument();
    expect(screen.queryByText("4:2")).not.toBeInTheDocument();
    expect(screen.queryByText("0:0")).not.toBeInTheDocument();
  });

  it("shows just the free state, no pair or score (AC-9)", () => {
    render(<ArenaCard arena={arena({ state: "free" })} />);
    expect(screen.getByText("свободна")).toBeInTheDocument();
    expect(screen.queryByText(/Бой \d+ из \d+/)).not.toBeInTheDocument();
  });

  it("FR-21 (спека 0043): показывает ориентировочное время следующего боя площадки, когда оно есть", () => {
    render(
      <ArenaCard
        arena={arena({
          state: "preparing",
          currentBout: { ...bout, state: "BOUT_STATE_NOT_STARTED" },
          nextBoutForecast: {
            expectedStartAt: "2026-08-22T11:20:00.000Z",
            boutsAhead: 0,
            provisional: false,
            imminent: false,
          },
        })}
      />,
    );
    expect(screen.getByText(/ориентировочно/)).toBeInTheDocument();
  });

  it("AC-19: у свободной площадки нет прогноза следующего боя и простой не показывается", () => {
    render(<ArenaCard arena={arena({ state: "free" })} />);
    expect(screen.queryByText(/ориентировочно/)).not.toBeInTheDocument();
    expect(screen.queryByText(/мин/)).not.toBeInTheDocument();
  });
});
