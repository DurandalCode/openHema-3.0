import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  poolPublicClient: { listPublicPools: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolsToJson: vi.fn((p) => p ?? []),
}));

import { poolPublicClient } from "@/lib/grpc/client";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/nominations/n1/public-pools");
}

describe("app/api/nominations/[id]/public-pools route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not require an access token (public)", async () => {
    vi.mocked(poolPublicClient.listPublicPools).mockResolvedValue({ pools: [] } as never);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
  });

  it("returns pools JSON on ok", async () => {
    vi.mocked(poolPublicClient.listPublicPools).mockResolvedValue({
      pools: [{ id: "p1", status: "POOL_STATUS_PREPARING" }],
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ pools: [{ id: "p1", status: "POOL_STATUS_PREPARING" }] });
    expect(poolPublicClient.listPublicPools).toHaveBeenCalledWith({ nominationId: "n1" });
  });

  it("returns empty list when layout is draft (AC-14, server-side gate)", async () => {
    vi.mocked(poolPublicClient.listPublicPools).mockResolvedValue({ pools: [] } as never);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    const data = await res.json();
    expect(data).toEqual({ pools: [] });
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(poolPublicClient.listPublicPools).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(404);
  });
});
