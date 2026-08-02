import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { controlArenaTimer: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaLiveToJson: vi.fn((s) => s ?? null),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { TimerCommandKind } from "@/gen/hema/v1/pool_pb";
import { POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/arenas/a1/timer", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("app/api/arenas/[id]/timer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq({ kind: "START" }), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.controlArenaTimer).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown command kind", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq({ kind: "NOPE" }), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(400);
    expect(poolAdminClient.controlArenaTimer).not.toHaveBeenCalled();
  });

  it("relays START/PAUSE/RESET without amountSeconds (defaults to 0)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.controlArenaTimer).mockResolvedValue({ snapshot: {} } as never);

    await POST(postReq({ kind: "PAUSE" }), { params: Promise.resolve({ id: "a1" }) });

    expect(poolAdminClient.controlArenaTimer).toHaveBeenCalledWith(
      { arenaId: "a1", command: { kind: TimerCommandKind.PAUSE, amountSeconds: 0 } },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("relays ADJUST with a signed amountSeconds", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.controlArenaTimer).mockResolvedValue({ snapshot: {} } as never);

    const res = await POST(postReq({ kind: "ADJUST", amountSeconds: -3 }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(res.status).toBe(200);
    expect(poolAdminClient.controlArenaTimer).toHaveBeenCalledWith(
      { arenaId: "a1", command: { kind: TimerCommandKind.ADJUST, amountSeconds: -3 } },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.controlArenaTimer).mockRejectedValue(
      new ConnectError("no room", Code.NotFound),
    );
    const res = await POST(postReq({ kind: "START" }), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });
});
