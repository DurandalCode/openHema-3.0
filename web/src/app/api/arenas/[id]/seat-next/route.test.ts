import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { seatNextPool: vi.fn() },
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

const ctx = { params: Promise.resolve({ id: "a1" }) };
const req = () => new NextRequest("http://localhost/api/arenas/a1/seat-next", { method: "POST" });

describe("app/api/arenas/[id]/seat-next route (спека 0063)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(stageAdminClient.seatNextPool).not.toHaveBeenCalled();
  });

  it("seats the next pool and returns the arena pools", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.seatNextPool).mockResolvedValue({
      pools: { seated: { id: "p1" }, available: [], queued: [{ id: "p2" }] },
    } as never);

    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.seated).toEqual({ id: "p1" });
    expect(data.queued).toEqual([{ id: "p2" }]);
    expect(stageAdminClient.seatNextPool).toHaveBeenCalledWith(
      { arenaId: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps FailedPrecondition (empty queue / head unavailable) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.seatNextPool).mockRejectedValue(
      new ConnectError("head unavailable", Code.FailedPrecondition),
    );
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
  });
});
