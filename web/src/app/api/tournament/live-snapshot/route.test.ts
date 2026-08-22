import { ConnectError, Code } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  tournamentClient: { getActiveTournament: vi.fn() },
  stagePublicClient: { getTournamentLive: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  tournamentLiveToJson: vi.fn((s) => s ?? null),
}));

import { tournamentClient, stagePublicClient } from "@/lib/grpc/client";
import { GET } from "./route";

describe("app/api/tournament/live-snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not require an access token (public)", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1" },
    } as never);
    vi.mocked(stagePublicClient.getTournamentLive).mockResolvedValue({
      snapshot: { tournamentId: "t1", arenas: [], bouts: [], nominations: [] },
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("resolves the active tournament first, then calls GetTournamentLive with its id", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1" },
    } as never);
    vi.mocked(stagePublicClient.getTournamentLive).mockResolvedValue({
      snapshot: { tournamentId: "t1", arenas: [], bouts: [], nominations: [] },
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      snapshot: { tournamentId: "t1", arenas: [], bouts: [], nominations: [] },
    });
    expect(tournamentClient.getActiveTournament).toHaveBeenCalledWith({});
    expect(stagePublicClient.getTournamentLive).toHaveBeenCalledWith({ tournamentId: "t1" });
  });

  it("returns 404 when there is no active tournament, without calling GetTournamentLive", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: undefined,
    } as never);

    const res = await GET();
    expect(res.status).toBe(404);
    expect(stagePublicClient.getTournamentLive).not.toHaveBeenCalled();
  });

  it("maps ConnectError NotFound → 404 when GetTournamentLive itself fails", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1" },
    } as never);
    vi.mocked(stagePublicClient.getTournamentLive).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("maps a generic ConnectError code → HTTP via errorResponse", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1" },
    } as never);
    vi.mocked(stagePublicClient.getTournamentLive).mockRejectedValue(
      new ConnectError("bad state", Code.FailedPrecondition),
    );

    const res = await GET();
    expect(res.status).toBe(409);
  });
});
