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
  boutBoardToJson: vi.fn((b) => b ?? null),
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
    vi.mocked(stageAdminClient.getArenaBoards).mockResolvedValue({
      entries: [
        { arenaId: "a1", board: { pool: { id: "p1" }, bouts: [], currentBoutId: "" } },
        { arenaId: "a2", board: undefined },
      ],
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      entries: [
        { arenaId: "a1", board: { pool: { id: "p1" }, bouts: [], currentBoutId: "" } },
        { arenaId: "a2", board: null },
      ],
    });
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
