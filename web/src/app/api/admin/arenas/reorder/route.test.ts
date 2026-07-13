import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  arenaAdminClient: { reorderArenas: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenasToJson: vi.fn((a) => a),
}));

import { arenaAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { arenasToJson } from "@/lib/grpc/serialize";
import { POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/arenas/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/admin/arenas/reorder route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq({ tournamentId: "t1", orderedIds: ["a1"] }));
    expect(res.status).toBe(401);
    expect(arenaAdminClient.reorderArenas).not.toHaveBeenCalled();
  });

  it("returns 400 when tournamentId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq({ orderedIds: ["a1"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when orderedIds is empty", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(postReq({ tournamentId: "t1", orderedIds: [] }));
    expect(res.status).toBe(400);
  });

  it("reorders arenas and returns JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(arenaAdminClient.reorderArenas).mockResolvedValue({
      arenas: [{ id: "a2" }, { id: "a1" }],
    } as never);
    vi.mocked(arenasToJson).mockReturnValue([{ id: "a2" }, { id: "a1" }] as never);

    const res = await POST(postReq({ tournamentId: "t1", orderedIds: ["a2", "a1"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ arenas: [{ id: "a2" }, { id: "a1" }] });
    expect(arenaAdminClient.reorderArenas).toHaveBeenCalledWith(
      { tournamentId: "t1", orderedIds: ["a2", "a1"] },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError InvalidArgument → 400", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(arenaAdminClient.reorderArenas).mockRejectedValue(
      new ConnectError("bad", Code.InvalidArgument),
    );
    const res = await POST(postReq({ tournamentId: "t1", orderedIds: ["a1"] }));
    expect(res.status).toBe(400);
  });
});