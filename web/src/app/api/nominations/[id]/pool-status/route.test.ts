import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { getLayout: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { GET } from "./route";

function req() {
  return new NextRequest("http://localhost/api/nominations/n1/pool-status");
}

describe("app/api/nominations/[id]/pool-status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.getLayout).not.toHaveBeenCalled();
  });

  it("maps ConnectError FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getLayout).mockRejectedValue(
      new ConnectError("err", Code.FailedPrecondition),
    );
    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(409);
  });

  it("returns status + canUndo slice from GetLayout on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getLayout).mockResolvedValue({
      layout: { nominationId: "n1" },
    } as never);
    vi.mocked(poolLayoutToJson).mockReturnValue({
      nominationId: "n1",
      status: "POOL_LAYOUT_STATUS_READY",
      canUndo: true,
    } as never);

    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: "POOL_LAYOUT_STATUS_READY", canUndo: true });
    expect(poolAdminClient.getLayout).toHaveBeenCalledWith(
      { nominationId: "n1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError PermissionDenied → 403", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getLayout).mockRejectedValue(
      new ConnectError("forbidden", Code.PermissionDenied),
    );
    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(403);
  });
});