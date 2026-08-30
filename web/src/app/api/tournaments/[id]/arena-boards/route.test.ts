import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { getArenaBoards: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaBoardEntriesToJson: vi.fn((entries) => entries ?? []),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/tournaments/t1/arena-boards");
}

describe("app/api/tournaments/[id]/arena-boards route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.getArenaBoards).not.toHaveBeenCalled();
  });

  it("returns entries on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const entries = [
      {
        arenaId: "a1",
        board: { pool: { id: "p1" }, bouts: [], currentBoutId: "" },
        idleState: "occupied",
        freeSince: null,
      },
      { arenaId: "a2", board: null, idleState: "free", freeSince: "2026-08-29T11:48:00.000Z" },
    ];
    vi.mocked(stageAdminClient.getArenaBoards).mockResolvedValue({ entries } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ entries });
    expect(stageAdminClient.getArenaBoards).toHaveBeenCalledWith(
      { tournamentId: "t1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.getArenaBoards).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(404);
  });
});
