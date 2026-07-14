import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { resetLayout: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req() {
  return new NextRequest("http://localhost/api/nominations/n1/pool-layout/reset", {
    method: "POST",
  });
}

describe("app/api/nominations/[id]/pool-layout/reset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.resetLayout).not.toHaveBeenCalled();
  });

  it("resets layout and returns JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.resetLayout).mockResolvedValue({
      layout: { pools: [] },
    } as never);

    const res = await POST(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    expect(poolAdminClient.resetLayout).toHaveBeenCalledWith(
      { nominationId: "n1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.resetLayout).mockRejectedValue(
      new ConnectError("not draft", Code.FailedPrecondition),
    );
    const res = await POST(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(409);
  });
});
