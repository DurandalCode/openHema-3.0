// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TournamentStrip } from "./tournament-strip";
import type { Tournament } from "@/entities/tournament/lib/types";
import type { TournamentLiveSnapshotDto } from "@/entities/tournament-live/lib/types";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Кубок Севера",
    description: "",
    eventStartAt: "2026-08-21T09:00:00Z",
    eventEndAt: "",
    emblemUrl: "",
    isActive: true,
    contacts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot(overrides: Partial<TournamentLiveSnapshotDto> = {}): TournamentLiveSnapshotDto {
  return {
    tournamentId: "t1",
    arenas: [],
    bouts: [],
    nominations: [],
    serverNowUnixMs: 0,
    ...overrides,
  };
}

const now = new Date("2026-08-22T12:00:00Z");

describe("widgets/home TournamentStrip (spec 0034, FR-12/FR-13, AC-18)", () => {
  afterEach(cleanup);

  it('shows the day number and "идёт" while running', () => {
    render(<TournamentStrip tournament={tournament()} snapshot={snapshot()} phase="running" now={now} />);
    expect(screen.getByText("День 2 · идёт")).toBeInTheDocument();
  });

  it('shows "Турнир завершён" and hides the busy-arenas counter when finished (AC-18)', () => {
    render(
      <TournamentStrip
        tournament={tournament()}
        snapshot={snapshot({ arenas: [{ arenaId: "a1", arenaName: "A", position: 0, state: "free", nominationId: "", nominationName: "", poolName: "", stageTitle: "", currentBout: null, poolBoutTotal: 0, poolBoutFinished: 0 }] })}
        phase="finished"
        now={now}
      />,
    );
    expect(screen.getByText("Турнир завершён")).toBeInTheDocument();
    expect(screen.queryByText(/Площадок занято/)).not.toBeInTheDocument();
  });

  it("shows the busy-arenas counter while running", () => {
    const arenas: TournamentLiveSnapshotDto["arenas"] = [
      { arenaId: "a1", arenaName: "A", position: 0, state: "bout_in_progress", nominationId: "n1", nominationName: "", poolName: "", stageTitle: "", currentBout: null, poolBoutTotal: 0, poolBoutFinished: 0 },
      { arenaId: "a2", arenaName: "B", position: 1, state: "free", nominationId: "", nominationName: "", poolName: "", stageTitle: "", currentBout: null, poolBoutTotal: 0, poolBoutFinished: 0 },
    ];
    render(<TournamentStrip tournament={tournament()} snapshot={snapshot({ arenas })} phase="running" now={now} />);
    expect(screen.getByText("Площадок занято 1 из 2")).toBeInTheDocument();
  });

  it("shows the bouts-done counter in both phases", () => {
    render(<TournamentStrip tournament={tournament()} snapshot={snapshot()} phase="finished" now={now} />);
    expect(screen.getByText("Боёв 0 из 0")).toBeInTheDocument();
  });

  it('links "О турнире" to the given detailsHref', () => {
    render(
      <TournamentStrip
        tournament={tournament()}
        snapshot={snapshot()}
        phase="running"
        now={now}
        detailsHref="/custom"
      />,
    );
    expect(screen.getByRole("link", { name: "О турнире" })).toHaveAttribute("href", "/custom");
  });
});
