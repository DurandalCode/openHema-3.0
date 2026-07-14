import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { setLayoutStatus: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { PoolLayoutStatus } from "@/gen/hema/v1/pool_pb";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/nominations/n1/pool-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations/[id]/pool-status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ status: "ready" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.setLayoutStatus).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid status value", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ status: "active" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(400);
    expect(poolAdminClient.setLayoutStatus).not.toHaveBeenCalled();
  });

  it("sets status to ready and returns layout JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.setLayoutStatus).mockResolvedValue({
      layout: { status: "POOL_LAYOUT_STATUS_READY" },
    } as never);

    const res = await POST(req({ status: "ready" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    expect(poolAdminClient.setLayoutStatus).toHaveBeenCalledWith(
      { nominationId: "n1", status: PoolLayoutStatus.READY },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("sets status to draft", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.setLayoutStatus).mockResolvedValue({
      layout: { status: "POOL_LAYOUT_STATUS_DRAFT" },
    } as never);

    await POST(req({ status: "draft" }), { params: Promise.resolve({ id: "n1" }) });
    expect(poolAdminClient.setLayoutStatus).toHaveBeenCalledWith(
      { nominationId: "n1", status: PoolLayoutStatus.DRAFT },
      { headers: { Authorization: "Bearer token" } },
    );
  });
});
