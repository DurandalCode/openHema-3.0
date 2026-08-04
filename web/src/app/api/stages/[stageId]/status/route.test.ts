import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { setLayoutStatus: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/stages/s1/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/stages/[stageId]/status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ status: "ready" }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.setLayoutStatus).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const badReq = new NextRequest("http://localhost/api/stages/s1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(badReq, { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is neither 'draft' nor 'ready'", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ status: "finished" }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(400);
    expect(stageAdminClient.setLayoutStatus).not.toHaveBeenCalled();
  });

  it("sets status to ready and returns layout JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.setLayoutStatus).mockResolvedValue({
      layout: { status: "POOL_LAYOUT_STATUS_READY" },
    } as never);

    const res = await POST(req({ status: "ready" }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(200);
    expect(stageAdminClient.setLayoutStatus).toHaveBeenCalledWith(
      { stageId: "s1", status: 2 },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("sets status to draft (numeric 1)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.setLayoutStatus).mockResolvedValue({
      layout: { status: "POOL_LAYOUT_STATUS_DRAFT" },
    } as never);

    await POST(req({ status: "draft" }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(stageAdminClient.setLayoutStatus).toHaveBeenCalledWith(
      { stageId: "s1", status: 1 },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition → 409 (ErrNotEnoughSeeds, AC-4)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.setLayoutStatus).mockRejectedValue(
      new ConnectError("not enough seeds", Code.FailedPrecondition),
    );
    const res = await POST(req({ status: "ready" }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(409);
  });
});
