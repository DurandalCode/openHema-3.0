import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  stagePublicClient: { getNominationResults: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationResultsToJson: vi.fn((r) => r ?? null),
}));
vi.mock("@/lib/grpc/preprod-guard", () => ({ assertPreprodAccess: vi.fn() }));

import { stagePublicClient } from "@/lib/grpc/client";
import { assertPreprodAccess } from "@/lib/grpc/preprod-guard";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/nominations/n1/results");
}

describe("app/api/nominations/[id]/results route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not require an access token (public)", async () => {
    vi.mocked(stagePublicClient.getNominationResults).mockResolvedValue({
      results: { nominationId: "n1" },
    } as never);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
  });

  it("returns the results JSON on ok", async () => {
    vi.mocked(stagePublicClient.getNominationResults).mockResolvedValue({
      results: { nominationId: "n1", nominationFinished: true, sections: [] },
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      results: { nominationId: "n1", nominationFinished: true, sections: [] },
    });
    expect(stagePublicClient.getNominationResults).toHaveBeenCalledWith({ nominationId: "n1" });
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(stagePublicClient.getNominationResults).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(404);
  });

  it("maps ConnectError Internal → 500", async () => {
    vi.mocked(stagePublicClient.getNominationResults).mockRejectedValue(
      new ConnectError("boom", Code.Internal),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(500);
  });

  it("returns 401 and skips upstream when preprod gate blocks the request", async () => {
    vi.mocked(assertPreprodAccess).mockResolvedValueOnce(
      NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    );

    const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(stagePublicClient.getNominationResults).not.toHaveBeenCalled();
  });
});
