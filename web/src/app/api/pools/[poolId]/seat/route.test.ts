import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { seatPoolOnArena: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/pools/p1/seat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/pools/[poolId]/seat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq({ arenaId: "a1" }), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.seatPoolOnArena).not.toHaveBeenCalled();
  });

  it("returns 400 when arenaId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq({}), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(400);
    expect(poolAdminClient.seatPoolOnArena).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const req = new NextRequest("http://localhost/api/pools/p1/seat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(400);
  });

  it("seats the pool and returns layout JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.seatPoolOnArena).mockResolvedValue({
      layout: { nominationId: "n1" },
    } as never);

    const res = await POST(postReq({ arenaId: "a1" }), {
      params: Promise.resolve({ poolId: "p1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ layout: { nominationId: "n1" } });
    expect(poolAdminClient.seatPoolOnArena).toHaveBeenCalledWith(
      { poolId: "p1", arenaId: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition (not ready/already seated/arena busy) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.seatPoolOnArena).mockRejectedValue(
      new ConnectError("pool not ready", Code.FailedPrecondition),
    );
    const res = await POST(postReq({ arenaId: "a1" }), {
      params: Promise.resolve({ poolId: "p1" }),
    });
    expect(res.status).toBe(409);
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.seatPoolOnArena).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await POST(postReq({ arenaId: "a1" }), {
      params: Promise.resolve({ poolId: "p1" }),
    });
    expect(res.status).toBe(404);
  });
});
