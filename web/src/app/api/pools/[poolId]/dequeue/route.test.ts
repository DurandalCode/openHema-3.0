import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { dequeuePool: vi.fn() },
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
const req = () => new NextRequest("http://localhost/api/pools/p1/dequeue", { method: "POST" });

describe("app/api/pools/[poolId]/dequeue route (спека 0063)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(stageAdminClient.dequeuePool).not.toHaveBeenCalled();
  });

  it("dequeues the pool and returns the arena pools", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.dequeuePool).mockResolvedValue({
      pools: { available: [{ id: "p1" }], queued: [] },
    } as never);

    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).available).toEqual([{ id: "p1" }]);
    expect(stageAdminClient.dequeuePool).toHaveBeenCalledWith(
      { poolId: "p1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.dequeuePool).mockRejectedValue(new ConnectError("nf", Code.NotFound));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
  });
});
