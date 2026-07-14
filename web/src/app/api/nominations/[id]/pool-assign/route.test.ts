import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { assignFighter: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/nominations/n1/pool-assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations/[id]/pool-assign route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ fighterId: "f1", poolId: "p1" }), {
      params: Promise.resolve({ id: "n1" }),
    });
    expect(res.status).toBe(401);
    expect(poolAdminClient.assignFighter).not.toHaveBeenCalled();
  });

  it("returns 400 when fighterId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ poolId: "p1" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when poolId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ fighterId: "f1" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(400);
  });

  it("assigns fighter and returns layout JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.assignFighter).mockResolvedValue({
      layout: { pools: [] },
    } as never);

    const res = await POST(req({ fighterId: "f1", poolId: "p1" }), {
      params: Promise.resolve({ id: "n1" }),
    });
    expect(res.status).toBe(200);
    expect(poolAdminClient.assignFighter).toHaveBeenCalledWith(
      { nominationId: "n1", fighterId: "f1", poolId: "p1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.assignFighter).mockRejectedValue(
      new ConnectError("not draft", Code.FailedPrecondition),
    );
    const res = await POST(req({ fighterId: "f1", poolId: "p1" }), {
      params: Promise.resolve({ id: "n1" }),
    });
    expect(res.status).toBe(409);
  });
});
