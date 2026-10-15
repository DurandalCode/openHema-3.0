import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { reorderArenaQueue: vi.fn() },
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
import { PUT } from "./route";

const ctx = { params: Promise.resolve({ id: "a1" }) };

function putReq(body: unknown, raw?: string) {
  return new NextRequest("http://localhost/api/arenas/a1/queue", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

describe("app/api/arenas/[id]/queue route (спека 0063)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await PUT(putReq({ poolIds: ["p1"] }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 when poolIds is not an array", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await PUT(putReq({ poolIds: "p1" }), ctx);
    expect(res.status).toBe(400);
    expect(stageAdminClient.reorderArenaQueue).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await PUT(putReq(null, "nope"), ctx);
    expect(res.status).toBe(400);
  });

  it("reorders the queue and returns the arena pools", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.reorderArenaQueue).mockResolvedValue({
      pools: { available: [], queued: [{ id: "p2" }, { id: "p1" }] },
    } as never);

    const res = await PUT(putReq({ poolIds: ["p2", "p1"] }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).queued).toEqual([{ id: "p2" }, { id: "p1" }]);
    expect(stageAdminClient.reorderArenaQueue).toHaveBeenCalledWith(
      { arenaId: "a1", poolIds: ["p2", "p1"] },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps FailedPrecondition (stale set) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.reorderArenaQueue).mockRejectedValue(
      new ConnectError("mismatch", Code.FailedPrecondition),
    );
    const res = await PUT(putReq({ poolIds: ["p1"] }), ctx);
    expect(res.status).toBe(409);
  });
});
