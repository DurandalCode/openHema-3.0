import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/entities/tournament/model/get-active-tournament", () => ({
  getActiveTournament: vi.fn(),
}));
vi.mock("./get-tournament-live", () => ({
  getTournamentLive: vi.fn(),
}));

import { getActiveTournament } from "@/entities/tournament/model/get-active-tournament";
import { getTournamentLive } from "./get-tournament-live";
import { getPublicPhase } from "./get-public-phase";
import type { Tournament } from "@/entities/tournament/lib/types";
import type { LiveNominationDto, TournamentLiveSnapshotDto } from "../lib/types";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Cup",
    description: "",
    eventStartAt: "",
    eventEndAt: "",
    emblemUrl: "",
    isActive: true,
    contacts: [],
    createdAt: "",
    updatedAt: "",
    chiefJudge: "",
    regulationsUrl: "",
    venueName: "",
    venueAddress: "",
    entryFeeMinor: null,
    entryFeeCurrency: "",
    program: [],
    ...overrides,
  };
}

function snapshot(nominations: LiveNominationDto[]): TournamentLiveSnapshotDto {
  return {
    tournamentId: "t1",
    serverNowUnixMs: "0",
    arenas: [],
    bouts: [],
    nominations,
  };
}

function nomination(phase: LiveNominationDto["phase"]): LiveNominationDto {
  return {
    nominationId: "n1",
    title: "Nomination",
    position: 0,
    phase,
    currentStageTitle: "",
    boutTotal: 0,
    boutFinished: 0,
    fighterCount: 0,
  };
}

describe("getPublicPhase (spec 0039, T15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'before' when there is no active tournament", async () => {
    vi.mocked(getActiveTournament).mockResolvedValue(null);

    expect(await getPublicPhase()).toBe("before");
    expect(getTournamentLive).not.toHaveBeenCalled();
  });

  it("returns 'running' when the live snapshot has a running nomination", async () => {
    vi.mocked(getActiveTournament).mockResolvedValue(tournament());
    vi.mocked(getTournamentLive).mockResolvedValue(snapshot([nomination("running")]));

    expect(await getPublicPhase()).toBe("running");
    expect(getTournamentLive).toHaveBeenCalledWith("t1");
  });

  it("returns 'finished' when all nominations are finished", async () => {
    vi.mocked(getActiveTournament).mockResolvedValue(tournament());
    vi.mocked(getTournamentLive).mockResolvedValue(snapshot([nomination("finished")]));

    expect(await getPublicPhase()).toBe("finished");
  });

  it("returns 'before' on the boundary case where getActiveTournament rejects", async () => {
    vi.mocked(getActiveTournament).mockRejectedValue(new Error("grpc down"));

    expect(await getPublicPhase()).toBe("before");
  });
});
