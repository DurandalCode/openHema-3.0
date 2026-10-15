import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { enqueuePool: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolsForArenaToJson: vi.fn((r) => ({
    seated: r?.seated ?? null,
    available: r?.available ?? [],
    queued: r?.queued ?? [],
  })),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

const ctx = { params: Promise.resolve({ poolId: "p1" }) };

function postReq(body: unknown, raw?: string) {
  return new NextRequest("http://localhost/api/pools/p1/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

describe("app/api/pools/[poolId]/enqueue route (спека 0063)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq({ arenaId: "a1" }), ctx);
    expect(res.status).toBe(401);
    expect(stageAdminClient.enqueuePool).not.toHaveBeenCalled();
  });

  it("returns 400 when arenaId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq({}), ctx);
    expect(res.status).toBe(400);
    expect(stageAdminClient.enqueuePool).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq(null, "not json"), ctx);
    expect(res.status).toBe(400);
  });

  it("enqueues the pool and returns the arena pools", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.enqueuePool).mockResolvedValue({
      pools: { available: [], queued: [{ id: "p1" }] },
    } as never);

    const res = await POST(postReq({ arenaId: "a1" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ seated: null, available: [], queued: [{ id: "p1" }] });
    expect(stageAdminClient.enqueuePool).toHaveBeenCalledWith(
      { poolId: "p1", arenaId: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.enqueuePool).mockRejectedValue(
      new ConnectError("pool seated", Code.FailedPrecondition),
    );
    const res = await POST(postReq({ arenaId: "a1" }), ctx);
    expect(res.status).toBe(409);
  });
});
