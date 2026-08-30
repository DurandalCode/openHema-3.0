// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BoutFeedRow } from "./bout-feed-row";
import { boutTimeLabel } from "@/entities/tournament-live/lib/feed";
import type { LiveFeedBoutDto } from "@/entities/tournament-live/lib/types";

function bout(overrides: Partial<LiveFeedBoutDto> = {}): LiveFeedBoutDto {
  return {
    boutId: "b1",
    nominationId: "n1",
    nominationName: "Длинный меч",
    stageTitle: "Группа A",
    poolName: "Пул A",
    arenaId: "a1",
    arenaName: "Арена 1",
    sequenceNumber: 1,
    poolBoutTotal: 5,
    fighterA: { fighterId: "f1", name: "Иванов", club: "" },
    fighterB: { fighterId: "f2", name: "Петров", club: "" },
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    startedAt: null,
    finishedAt: null,
    forecast: undefined,
    ...overrides,
  };
}

function renderRow(b: LiveFeedBoutDto) {
  return render(
    <table>
      <tbody>
        <BoutFeedRow bout={b} />
      </tbody>
    </table>,
  );
}

describe("widgets/home BoutFeedRow (spec 0034, FR-15/FR-16, AC-11..AC-13)", () => {
  afterEach(cleanup);

  it("shows the start time and 'идёт' state for an in-progress bout (AC-11)", () => {
    const b = bout({
      state: "BOUT_STATE_IN_PROGRESS",
      startedAt: "2026-08-22T11:02:00Z",
      scoreA: 4,
      scoreB: 2,
    });
    renderRow(b);
    // Не проверяем конкретное значение времени: `boutTimeLabel` форматирует
    // его через `toLocaleTimeString`, зависящий от часового пояса окружения
    // (тот же приём, что уже использует `entities/tournament-live/lib/feed.test.ts`).
    expect(screen.getByText(boutTimeLabel(b))).toBeInTheDocument();
    expect(screen.getByText("идёт")).toBeInTheDocument();
    expect(screen.getByText("4:2")).toBeInTheDocument();
  });

  it("shows the finish time and the winner for a finished bout (AC-12)", () => {
    const b = bout({
      state: "BOUT_STATE_FINISHED",
      finishedAt: "2026-08-22T10:44:00Z",
      scoreA: 5,
      scoreB: 3,
    });
    renderRow(b);
    expect(screen.getByText(boutTimeLabel(b))).toBeInTheDocument();
    expect(screen.getByText("завершён · Иванов")).toBeInTheDocument();
  });

  it("shows a dash when a not-started bout has no forecast — unseated pool, out of the estimation horizon (спека 0043, FR-9/FR-20)", () => {
    renderRow(bout({ state: "BOUT_STATE_NOT_STARTED" }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("не начат")).toBeInTheDocument();
  });

  it("shows the forecast instead of a dash for a not-started bout of a seated pool (спека 0043, FR-20)", () => {
    renderRow(
      bout({
        state: "BOUT_STATE_NOT_STARTED",
        forecast: {
          expectedStartAt: "2026-08-22T11:20:00.000Z",
          boutsAhead: 1,
          provisional: false,
          imminent: false,
        },
      }),
    );
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.getByText(/ориентировочно/)).toBeInTheDocument();
  });

  it("shows the nomination and stage together", () => {
    renderRow(bout({ nominationName: "Длинный меч", stageTitle: "Плейофф 1/4" }));
    expect(screen.getByText("Длинный меч · Плейофф 1/4")).toBeInTheDocument();
  });
});
