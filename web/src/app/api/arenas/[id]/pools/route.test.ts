import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { getPoolsForArena: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolToJson: vi.fn((p) => p ?? null),
  poolsToJson: vi.fn((p) => p ?? []),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/arenas/a1/pools");
}

describe("app/api/arenas/[id]/pools route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.getPoolsForArena).not.toHaveBeenCalled();
  });

  it("returns seated=null and available pools when arena is free", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getPoolsForArena).mockResolvedValue({
      seated: undefined,
      available: [{ id: "p1" }, { id: "p2" }],
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ seated: null, available: [{ id: "p1" }, { id: "p2" }] });
    expect(poolAdminClient.getPoolsForArena).toHaveBeenCalledWith(
      { arenaId: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("returns seated pool when arena is occupied", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getPoolsForArena).mockResolvedValue({
      seated: { id: "p1", status: "POOL_STATUS_PREPARING" },
      available: [],
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.seated).toEqual({ id: "p1", status: "POOL_STATUS_PREPARING" });
    expect(data.available).toEqual([]);
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getPoolsForArena).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });
});
