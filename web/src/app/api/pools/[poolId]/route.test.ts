import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { deletePool: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { DELETE } from "./route";

function req() {
  return new NextRequest("http://localhost/api/pools/p1", { method: "DELETE" });
}

describe("app/api/pools/[poolId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await DELETE(req(), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.deletePool).not.toHaveBeenCalled();
  });

  it("deletes pool and returns layout JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.deletePool).mockResolvedValue({
      layout: { pools: [] },
    } as never);

    const res = await DELETE(req(), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(200);
    expect(poolAdminClient.deletePool).toHaveBeenCalledWith(
      { poolId: "p1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.deletePool).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await DELETE(req(), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(404);
  });
});
