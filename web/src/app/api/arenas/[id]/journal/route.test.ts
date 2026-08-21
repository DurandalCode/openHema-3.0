import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { getArenaJournal: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  journalEntriesToJson: vi.fn((entries) => entries ?? []),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/arenas/a1/journal");
}

describe("app/api/arenas/[id]/journal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.getArenaJournal).not.toHaveBeenCalled();
  });

  it("returns the journal entries on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.getArenaJournal).mockResolvedValue({
      entries: [{ boutId: "b1" }],
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ entries: [{ boutId: "b1" }] });
    expect(stageAdminClient.getArenaJournal).toHaveBeenCalledWith(
      { arenaId: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("returns an empty array when the arena has no seated pool (AC-20)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.getArenaJournal).mockResolvedValue({ entries: [] } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ entries: [] });
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.getArenaJournal).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });
});
