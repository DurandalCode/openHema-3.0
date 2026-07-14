import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { unassignFighter: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/nominations/n1/pool-unassign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations/[id]/pool-unassign route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ fighterId: "f1" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.unassignFighter).not.toHaveBeenCalled();
  });

  it("returns 400 when fighterId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({}), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(400);
  });

  it("unassigns fighter and returns layout JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.unassignFighter).mockResolvedValue({
      layout: { pools: [] },
    } as never);

    const res = await POST(req({ fighterId: "f1" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    expect(poolAdminClient.unassignFighter).toHaveBeenCalledWith(
      { nominationId: "n1", fighterId: "f1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.unassignFighter).mockRejectedValue(
      new ConnectError("not draft", Code.FailedPrecondition),
    );
    const res = await POST(req({ fighterId: "f1" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(409);
  });
});
