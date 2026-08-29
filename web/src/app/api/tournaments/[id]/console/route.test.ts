import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { getTournamentConsole: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  consoleSnapshotToJson: vi.fn((s) => s ?? null),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/tournaments/t1/console");
}

describe("app/api/tournaments/[id]/console route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.getTournamentConsole).not.toHaveBeenCalled();
  });

  it("returns the snapshot on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.getTournamentConsole).mockResolvedValue({
      snapshot: { tournamentId: "t1", arenas: [] },
    } as never);

    const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ snapshot: { tournamentId: "t1", arenas: [] } });
    expect(stageAdminClient.getTournamentConsole).toHaveBeenCalledWith(
      { tournamentId: "t1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError PermissionDenied → 403", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.getTournamentConsole).mockRejectedValue(
      new ConnectError("not admin", Code.PermissionDenied),
    );
    const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
  });
});
