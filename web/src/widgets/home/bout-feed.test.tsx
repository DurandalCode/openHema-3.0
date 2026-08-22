// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoutFeed } from "./bout-feed";
import type { LiveFeedBoutDto, LiveNominationDto } from "@/entities/tournament-live/lib/types";

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
    ...overrides,
  };
}

function nomination(overrides: Partial<LiveNominationDto> = {}): LiveNominationDto {
  return {
    nominationId: "n1",
    title: "Длинный меч",
    position: 0,
    phase: "running",
    currentStageTitle: "",
    boutTotal: 0,
    boutFinished: 0,
    fighterCount: 0,
    ...overrides,
  };
}

describe("widgets/home BoutFeed (spec 0034, FR-15..FR-18, AC-15)", () => {
  afterEach(cleanup);

  it("shows an empty state and no table when there are no bouts", () => {
    render(<BoutFeed bouts={[]} nominations={[]} />);
    expect(screen.getByText("Боёв пока нет")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders all bouts by default", () => {
    render(
      <BoutFeed
        bouts={[
          bout({ boutId: "b1", nominationId: "n1", fighterA: { fighterId: "f1", name: "Иванов", club: "" } }),
          bout({ boutId: "b2", nominationId: "n2", fighterA: { fighterId: "f3", name: "Сидоров", club: "" } }),
        ]}
        nominations={[nomination({ nominationId: "n1", title: "Длинный меч" }), nomination({ nominationId: "n2", title: "Рапира" })]}
      />,
    );
    expect(screen.getByText(/Иванов/)).toBeInTheDocument();
    expect(screen.getByText(/Сидоров/)).toBeInTheDocument();
  });

  it("filters the visible list on chip click without any network calls (AC-15)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <BoutFeed
        bouts={[
          bout({ boutId: "b1", nominationId: "n1", fighterA: { fighterId: "f1", name: "Иванов", club: "" } }),
          bout({ boutId: "b2", nominationId: "n2", fighterA: { fighterId: "f3", name: "Сидоров", club: "" } }),
        ]}
        nominations={[nomination({ nominationId: "n1", title: "Длинный меч" }), nomination({ nominationId: "n2", title: "Рапира" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Длинный меч/ }));

    expect(screen.getByText(/Иванов/)).toBeInTheDocument();
    expect(screen.queryByText(/Сидоров/)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("only lists filter chips for nominations that actually have bouts (AC-10)", () => {
    render(
      <BoutFeed
        bouts={[bout({ boutId: "b1", nominationId: "n1" })]}
        nominations={[
          nomination({ nominationId: "n1", title: "Длинный меч" }),
          nomination({ nominationId: "n2", title: "Черновик без боёв" }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /Длинный меч/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Черновик без боёв/ })).not.toBeInTheDocument();
  });

  it('returning to "Все номинации" shows the full list again', () => {
    render(
      <BoutFeed
        bouts={[
          bout({ boutId: "b1", nominationId: "n1", fighterA: { fighterId: "f1", name: "Иванов", club: "" } }),
          bout({ boutId: "b2", nominationId: "n2", fighterA: { fighterId: "f3", name: "Сидоров", club: "" } }),
        ]}
        nominations={[nomination({ nominationId: "n1", title: "Длинный меч" }), nomination({ nominationId: "n2", title: "Рапира" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Длинный меч/ }));
    expect(screen.queryByText(/Сидоров/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Все номинации" }));
    expect(screen.getByText(/Иванов/)).toBeInTheDocument();
    expect(screen.getByText(/Сидоров/)).toBeInTheDocument();
  });
});
