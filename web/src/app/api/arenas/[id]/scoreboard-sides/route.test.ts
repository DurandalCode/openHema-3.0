import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { setScoreboardSides: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaLiveToJson: vi.fn((s) => s ?? null),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/arenas/a1/scoreboard-sides", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("app/api/arenas/[id]/scoreboard-sides route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq({ swapped: true }), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.setScoreboardSides).not.toHaveBeenCalled();
  });

  it("returns 400 when swapped is missing/not boolean", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq({}), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(400);
    expect(poolAdminClient.setScoreboardSides).not.toHaveBeenCalled();
  });

  it("swaps sides and returns the snapshot on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.setScoreboardSides).mockResolvedValue({
      snapshot: { room: { sidesSwapped: true } },
    } as never);

    const res = await POST(postReq({ swapped: true }), { params: Promise.resolve({ id: "a1" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ snapshot: { room: { sidesSwapped: true } } });
    expect(poolAdminClient.setScoreboardSides).toHaveBeenCalledWith(
      { arenaId: "a1", swapped: true },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.setScoreboardSides).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await POST(postReq({ swapped: false }), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });
});
