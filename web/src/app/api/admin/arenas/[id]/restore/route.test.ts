import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  arenaAdminClient: { restoreArena: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaToJson: vi.fn((a) => a),
}));

import { arenaAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { arenaToJson } from "@/lib/grpc/serialize";
import { POST } from "./route";

describe("app/api/admin/arenas/[id]/restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const req = new NextRequest("http://localhost/api/admin/arenas/a1/restore", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(arenaAdminClient.restoreArena).not.toHaveBeenCalled();
  });

  it("restores arena and returns JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(arenaAdminClient.restoreArena).mockResolvedValue({
      arena: { id: "a1", status: "ARENA_STATUS_ACTIVE" },
    } as never);
    vi.mocked(arenaToJson).mockReturnValue({ id: "a1", status: "ARENA_STATUS_ACTIVE" } as never);

    const req = new NextRequest("http://localhost/api/admin/arenas/a1/restore", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ arena: { id: "a1", status: "ARENA_STATUS_ACTIVE" } });
    expect(arenaAdminClient.restoreArena).toHaveBeenCalledWith(
      { id: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(arenaAdminClient.restoreArena).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const req = new NextRequest("http://localhost/api/admin/arenas/a1/restore", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });
});