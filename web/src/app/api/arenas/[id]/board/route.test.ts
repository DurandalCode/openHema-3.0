import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { getBoutBoard: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  boutBoardToJson: vi.fn((b) => b ?? null),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/arenas/a1/board");
}

describe("app/api/arenas/[id]/board route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.getBoutBoard).not.toHaveBeenCalled();
  });

  it("returns the board on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getBoutBoard).mockResolvedValue({
      board: { pool: { id: "p1" }, bouts: [], currentBoutId: "" },
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ board: { pool: { id: "p1" }, bouts: [], currentBoutId: "" } });
    expect(poolAdminClient.getBoutBoard).toHaveBeenCalledWith(
      { arenaId: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getBoutBoard).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });
});
