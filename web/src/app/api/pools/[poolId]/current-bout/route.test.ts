import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { setCurrentBout: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  boutBoardToJson: vi.fn((b) => b ?? null),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { PUT } from "./route";

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/pools/p1/current-bout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/pools/[poolId]/current-bout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await PUT(putReq({ boutId: "b1" }), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.setCurrentBout).not.toHaveBeenCalled();
  });

  it("returns 400 when boutId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await PUT(putReq({}), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(400);
    expect(stageAdminClient.setCurrentBout).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const req = new NextRequest("http://localhost/api/pools/p1/current-bout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PUT(req, { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(400);
  });

  it("sets the current bout and returns board JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.setCurrentBout).mockResolvedValue({
      board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" },
    } as never);

    const res = await PUT(putReq({ boutId: "b1" }), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" } });
    expect(stageAdminClient.setCurrentBout).toHaveBeenCalledWith(
      { poolId: "p1", boutId: "b1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition (bout not in pool) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.setCurrentBout).mockRejectedValue(
      new ConnectError("not in pool", Code.FailedPrecondition),
    );
    const res = await PUT(putReq({ boutId: "b1" }), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(409);
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.setCurrentBout).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await PUT(putReq({ boutId: "b1" }), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(404);
  });
});
