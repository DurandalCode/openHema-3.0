// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NextBoutCard } from "./next-bout-card";
import type { LiveFeedBoutDto } from "@/entities/tournament-live/lib/types";

const myFighterId = "f1";

function bout(overrides: Partial<LiveFeedBoutDto> = {}): LiveFeedBoutDto {
  return {
    boutId: "b1",
    nominationId: "n1",
    nominationName: "Длинный меч",
    stageTitle: "Группа A",
    poolName: "Пул C",
    arenaId: "a1",
    arenaName: "Арена 1",
    sequenceNumber: 3,
    poolBoutTotal: 5,
    fighterA: { fighterId: myFighterId, name: "Иван Кравцов", club: "Северный клинок" },
    fighterB: { fighterId: "f2", name: "Соперник", club: "Клуб 2" },
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    startedAt: null,
    finishedAt: null,
    forecast: undefined,
    ...overrides,
  };
}

describe("widgets/dashboard NextBoutCard (спека 0038 FR-33/FR-34; спека 0043 FR-23)", () => {
  afterEach(cleanup);

  it("AC-5: без прогноза (пул не поставлен) показывает очередь и объяснение вместо времени", () => {
    const before = bout({
      boutId: "before",
      sequenceNumber: 2,
      fighterA: { fighterId: "x", name: "X", club: "" },
      fighterB: { fighterId: "y", name: "Y", club: "" },
    });
    const mine = bout({ sequenceNumber: 3 });
    render(<NextBoutCard bouts={[before, mine]} fighterId={myFighterId} />);

    expect(screen.getByText(/через 1 бой/i)).toBeInTheDocument();
    expect(screen.getByText("пул ещё не поставлен на площадку")).toBeInTheDocument();
    expect(screen.queryByText(/ориентировочно/)).not.toBeInTheDocument();
  });

  it("AC-6: с прогнозом показывает ориентировочное время и обратный отсчёт рядом с очередью", () => {
    const before = bout({
      boutId: "before",
      sequenceNumber: 2,
      fighterA: { fighterId: "x", name: "X", club: "" },
      fighterB: { fighterId: "y", name: "Y", club: "" },
    });
    const mine = bout({
      sequenceNumber: 3,
      forecast: {
        expectedStartAt: "2026-08-22T11:20:00.000Z",
        boutsAhead: 1,
        provisional: false,
        imminent: false,
      },
    });
    render(<NextBoutCard bouts={[before, mine]} fighterId={myFighterId} />);

    expect(screen.getByText(/через 1 бой/i)).toBeInTheDocument();
    expect(screen.getByText(/ориентировочно/)).toBeInTheDocument();
    expect(screen.queryByText("пул ещё не поставлен на площадку")).not.toBeInTheDocument();
  });

  it("AC-7: первый в очереди — «вы следующие», без объяснения про непоставленный пул", () => {
    const mine = bout({ sequenceNumber: 1 });
    render(<NextBoutCard bouts={[mine]} fighterId={myFighterId} />);

    expect(screen.getByText("вы следующие")).toBeInTheDocument();
  });

  it("бой уже идёт — счёт вместо прогноза, без объяснения", () => {
    const mine = bout({ state: "BOUT_STATE_IN_PROGRESS", scoreA: 3, scoreB: 1 });
    render(<NextBoutCard bouts={[mine]} fighterId={myFighterId} />);

    expect(screen.getByText("3:1")).toBeInTheDocument();
    expect(screen.queryByText("пул ещё не поставлен на площадку")).not.toBeInTheDocument();
    expect(screen.queryByText(/ориентировочно/)).not.toBeInTheDocument();
  });
});
