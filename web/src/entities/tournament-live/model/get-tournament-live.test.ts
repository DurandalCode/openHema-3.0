import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  stagePublicClient: { getTournamentLive: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  tournamentLiveToJson: vi.fn((s) => s),
}));

import { stagePublicClient } from "@/lib/grpc/client";
import { getTournamentLive } from "./get-tournament-live";
import { emptyTournamentLiveSnapshot } from "../lib/types";

describe("getTournamentLive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty snapshot without calling gRPC when tournamentId is empty", async () => {
    const snap = await getTournamentLive("");
    expect(snap).toEqual(emptyTournamentLiveSnapshot(""));
    expect(stagePublicClient.getTournamentLive).not.toHaveBeenCalled();
  });

  it("returns the snapshot JSON on ok", async () => {
    vi.mocked(stagePublicClient.getTournamentLive).mockResolvedValue({
      snapshot: { tournamentId: "t1", arenas: [], bouts: [], nominations: [] },
    } as never);

    const snap = await getTournamentLive("t1");
    expect(snap).toEqual({ tournamentId: "t1", arenas: [], bouts: [], nominations: [] });
    expect(stagePublicClient.getTournamentLive).toHaveBeenCalledWith({ tournamentId: "t1" });
  });

  it("returns an empty snapshot when snapshot is undefined in response", async () => {
    vi.mocked(stagePublicClient.getTournamentLive).mockResolvedValue({
      snapshot: undefined,
    } as never);

    expect(await getTournamentLive("t1")).toEqual(emptyTournamentLiveSnapshot("t1"));
  });

  it("returns an empty snapshot when gRPC throws", async () => {
    vi.mocked(stagePublicClient.getTournamentLive).mockRejectedValue(new Error("unavailable"));

    expect(await getTournamentLive("t1")).toEqual(emptyTournamentLiveSnapshot("t1"));
  });
});
