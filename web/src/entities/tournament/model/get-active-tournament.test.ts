import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  tournamentClient: { getActiveTournament: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  tournamentToJson: vi.fn((t) => t),
}));

import { tournamentClient } from "@/lib/grpc/client";
import { getActiveTournament } from "./get-active-tournament";

describe("getActiveTournament", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tournament JSON on ok", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: { id: "t1", title: "Cup" },
    } as never);

    const t = await getActiveTournament();
    expect(t).toEqual({ id: "t1", title: "Cup" });
  });

  it("returns null when tournament is undefined in response", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
      tournament: undefined,
    } as never);

    expect(await getActiveTournament()).toBeNull();
  });

  it("returns null when gRPC throws (NotFound/any)", async () => {
    vi.mocked(tournamentClient.getActiveTournament).mockRejectedValue(
      new Error("not found"),
    );

    expect(await getActiveTournament()).toBeNull();
  });
});