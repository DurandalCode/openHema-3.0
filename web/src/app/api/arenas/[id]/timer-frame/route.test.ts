import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { publishTimerFrame: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaLiveToJson: vi.fn((s) => s ?? null),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { TimerStatus } from "@/gen/hema/v1/pool_pb";
import { POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/arenas/a1/timer-frame", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("app/api/arenas/[id]/timer-frame route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq({}), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.publishTimerFrame).not.toHaveBeenCalled();
  });

  it("publishes the frame and returns the snapshot on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.publishTimerFrame).mockResolvedValue({
      snapshot: { defaultDurationSeconds: 90 },
    } as never);

    const res = await POST(
      postReq({ status: "TIMER_STATUS_RUNNING", remainingCs: 8900, sampledUnixMs: 1700000000000, defaultCs: 9000 }),
      { params: Promise.resolve({ id: "a1" }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ snapshot: { defaultDurationSeconds: 90 } });
    expect(poolAdminClient.publishTimerFrame).toHaveBeenCalledWith(
      {
        arenaId: "a1",
        frame: {
          status: TimerStatus.RUNNING,
          remainingCs: 8900,
          sampledUnixMs: 1700000000000n,
          defaultCs: 9000,
        },
      },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition (not the source) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.publishTimerFrame).mockRejectedValue(
      new ConnectError("not the timer source", Code.FailedPrecondition),
    );
    const res = await POST(
      postReq({ status: "TIMER_STATUS_RUNNING", remainingCs: 100, sampledUnixMs: 1, defaultCs: 9000 }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(409);
  });
});
