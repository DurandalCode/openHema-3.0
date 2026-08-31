import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  stagePublicClient: { listPublicPools: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolsToJson: vi.fn((p) => p ?? []),
  stagesToJson: vi.fn((s) => s ?? []),
}));
vi.mock("@/lib/grpc/preprod-guard", () => ({ assertPreprodAccess: vi.fn() }));

import { stagePublicClient } from "@/lib/grpc/client";
import { assertPreprodAccess } from "@/lib/grpc/preprod-guard";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/nominations/n1/public-pools");
}

describe("app/api/nominations/[id]/public-pools route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not require an access token (public)", async () => {
    vi.mocked(stagePublicClient.listPublicPools).mockResolvedValue({ pools: [] } as never);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
  });

  it("returns pools and stages JSON on ok", async () => {
    vi.mocked(stagePublicClient.listPublicPools).mockResolvedValue({
      pools: [{ id: "p1", status: "POOL_STATUS_PREPARING" }],
      stages: [{ id: "stage-1", title: "Групповой этап" }],
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      pools: [{ id: "p1", status: "POOL_STATUS_PREPARING" }],
      stages: [{ id: "stage-1", title: "Групповой этап" }],
    });
    expect(stagePublicClient.listPublicPools).toHaveBeenCalledWith({ nominationId: "n1" });
  });

  it("returns empty list when layout is draft (AC-14, server-side gate)", async () => {
    vi.mocked(stagePublicClient.listPublicPools).mockResolvedValue({ pools: [], stages: [] } as never);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    const data = await res.json();
    expect(data).toEqual({ pools: [], stages: [] });
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(stagePublicClient.listPublicPools).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 and skips upstream when preprod gate blocks the request", async () => {
    vi.mocked(assertPreprodAccess).mockResolvedValueOnce(
      NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    );

    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(stagePublicClient.listPublicPools).not.toHaveBeenCalled();
  });
});
