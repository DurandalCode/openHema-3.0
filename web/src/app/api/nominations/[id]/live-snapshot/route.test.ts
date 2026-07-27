import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  poolPublicClient: { getNominationLive: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationLiveToJson: vi.fn((s) => s ?? null),
}));

import { poolPublicClient } from "@/lib/grpc/client";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/nominations/n1/live-snapshot");
}

describe("app/api/nominations/[id]/live-snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not require an access token (public)", async () => {
    vi.mocked(poolPublicClient.getNominationLive).mockResolvedValue({
      snapshot: { nominationId: "n1", pools: [] },
    } as never);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
  });

  it("returns snapshot JSON on ok", async () => {
    vi.mocked(poolPublicClient.getNominationLive).mockResolvedValue({
      snapshot: { nominationId: "n1", pools: [{ pool: { id: "p1" }, bouts: [], currentBoutId: "" }] },
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      snapshot: { nominationId: "n1", pools: [{ pool: { id: "p1" }, bouts: [], currentBoutId: "" }] },
    });
    expect(poolPublicClient.getNominationLive).toHaveBeenCalledWith({ nominationId: "n1" });
  });

  it("returns empty pools when layout is draft (FR-12, server-side gate)", async () => {
    vi.mocked(poolPublicClient.getNominationLive).mockResolvedValue({
      snapshot: { nominationId: "n1", pools: [] },
    } as never);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    const data = await res.json();
    expect(data).toEqual({ snapshot: { nominationId: "n1", pools: [] } });
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(poolPublicClient.getNominationLive).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(404);
  });
});
