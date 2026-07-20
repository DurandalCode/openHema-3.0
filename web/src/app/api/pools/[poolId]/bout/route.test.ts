import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: {
    startCurrentBout: vi.fn(),
    scoreCurrentBout: vi.fn(),
    finishCurrentBout: vi.fn(),
    reopenCurrentBout: vi.fn(),
    resetCurrentBout: vi.fn(),
  },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  boutBoardToJson: vi.fn((b) => b ?? null),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/pools/p1/bout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ poolId: "p1" }) };

describe("app/api/pools/[poolId]/bout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq({ action: "start" }), ctx);
    expect(res.status).toBe(401);
    expect(poolAdminClient.startCurrentBout).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const req = new NextRequest("http://localhost/api/pools/p1/bout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown action", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq({ action: "nope" }), ctx);
    expect(res.status).toBe(400);
  });

  it("dispatches 'start' → startCurrentBout and returns board JSON", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.startCurrentBout).mockResolvedValue({
      board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" },
    } as never);

    const res = await POST(postReq({ action: "start" }), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" } });
    expect(poolAdminClient.startCurrentBout).toHaveBeenCalledWith(
      { poolId: "p1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("dispatches 'score' → scoreCurrentBout with scoreA/scoreB", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.scoreCurrentBout).mockResolvedValue({
      board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" },
    } as never);

    const res = await POST(postReq({ action: "score", scoreA: 5, scoreB: 3 }), ctx);
    expect(res.status).toBe(200);
    expect(poolAdminClient.scoreCurrentBout).toHaveBeenCalledWith(
      { poolId: "p1", scoreA: 5, scoreB: 3 },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("returns 400 for 'score' action missing scoreA/scoreB", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq({ action: "score", scoreA: 5 }), ctx);
    expect(res.status).toBe(400);
    expect(poolAdminClient.scoreCurrentBout).not.toHaveBeenCalled();
  });

  it("dispatches 'finish' → finishCurrentBout", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.finishCurrentBout).mockResolvedValue({
      board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b2" },
    } as never);

    const res = await POST(postReq({ action: "finish" }), ctx);
    expect(res.status).toBe(200);
    expect(poolAdminClient.finishCurrentBout).toHaveBeenCalledWith(
      { poolId: "p1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("dispatches 'reopen' → reopenCurrentBout", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.reopenCurrentBout).mockResolvedValue({
      board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" },
    } as never);

    const res = await POST(postReq({ action: "reopen" }), ctx);
    expect(res.status).toBe(200);
    expect(poolAdminClient.reopenCurrentBout).toHaveBeenCalledWith(
      { poolId: "p1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("dispatches 'reset' → resetCurrentBout", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.resetCurrentBout).mockResolvedValue({
      board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" },
    } as never);

    const res = await POST(postReq({ action: "reset" }), ctx);
    expect(res.status).toBe(200);
    expect(poolAdminClient.resetCurrentBout).toHaveBeenCalledWith(
      { poolId: "p1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition (invalid transition) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.startCurrentBout).mockRejectedValue(
      new ConnectError("pool not seated", Code.FailedPrecondition),
    );
    const res = await POST(postReq({ action: "start" }), ctx);
    expect(res.status).toBe(409);
  });

  it("maps ConnectError Aborted (version conflict) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.finishCurrentBout).mockRejectedValue(
      new ConnectError("concurrency conflict", Code.Aborted),
    );
    const res = await POST(postReq({ action: "finish" }), ctx);
    expect(res.status).toBe(409);
  });

  it("maps ConnectError InvalidArgument → 400", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.scoreCurrentBout).mockRejectedValue(
      new ConnectError("negative score", Code.InvalidArgument),
    );
    const res = await POST(postReq({ action: "score", scoreA: 1, scoreB: 1 }), ctx);
    expect(res.status).toBe(400);
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.startCurrentBout).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await POST(postReq({ action: "start" }), ctx);
    expect(res.status).toBe(404);
  });
});
