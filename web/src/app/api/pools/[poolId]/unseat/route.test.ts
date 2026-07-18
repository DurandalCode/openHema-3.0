import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { unseatPool: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function postReq() {
  return new NextRequest("http://localhost/api/pools/p1/unseat", { method: "POST" });
}

describe("app/api/pools/[poolId]/unseat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq(), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.unseatPool).not.toHaveBeenCalled();
  });

  it("unseats the pool and returns layout JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.unseatPool).mockResolvedValue({
      layout: { nominationId: "n1" },
    } as never);

    const res = await POST(postReq(), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ layout: { nominationId: "n1" } });
    expect(poolAdminClient.unseatPool).toHaveBeenCalledWith(
      { poolId: "p1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.unseatPool).mockRejectedValue(
      new ConnectError("not seated", Code.FailedPrecondition),
    );
    const res = await POST(postReq(), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(409);
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.unseatPool).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await POST(postReq(), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(404);
  });
});
