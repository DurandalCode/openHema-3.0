import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  arenaAdminClient: { archiveArena: vi.fn() },
  poolAdminClient: { getPoolsForArena: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaToJson: vi.fn((a) => a),
}));

import { arenaAdminClient, poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { arenaToJson } from "@/lib/grpc/serialize";
import { POST } from "./route";

describe("app/api/admin/arenas/[id]/archive route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(poolAdminClient.getPoolsForArena).mockResolvedValue({
      seated: undefined,
      available: [],
    } as never);
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const req = new NextRequest("http://localhost/api/admin/arenas/a1/archive", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(arenaAdminClient.archiveArena).not.toHaveBeenCalled();
  });

  it("archives arena and returns JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(arenaAdminClient.archiveArena).mockResolvedValue({
      arena: { id: "a1", status: "ARENA_STATUS_ARCHIVED" },
    } as never);
    vi.mocked(arenaToJson).mockReturnValue({ id: "a1", status: "ARENA_STATUS_ARCHIVED" } as never);

    const req = new NextRequest("http://localhost/api/admin/arenas/a1/archive", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ arena: { id: "a1", status: "ARENA_STATUS_ARCHIVED" } });
    expect(arenaAdminClient.archiveArena).toHaveBeenCalledWith(
      { id: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(arenaAdminClient.archiveArena).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const req = new NextRequest("http://localhost/api/admin/arenas/a1/archive", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });

  // Спека 0011, FR-10/AC-10: нельзя архивировать арену, на которой стоит пул.
  it("returns 409 and does not archive when arena has a seated pool", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getPoolsForArena).mockResolvedValue({
      seated: { id: "p1", nominationId: "n1" },
      available: [],
    } as never);

    const req = new NextRequest("http://localhost/api/admin/arenas/a1/archive", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(409);
    expect(poolAdminClient.getPoolsForArena).toHaveBeenCalledWith(
      { arenaId: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
    expect(arenaAdminClient.archiveArena).not.toHaveBeenCalled();
  });

  it("propagates errors from GetPoolsForArena without archiving", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.getPoolsForArena).mockRejectedValue(
      new ConnectError("boom", Code.Internal),
    );

    const req = new NextRequest("http://localhost/api/admin/arenas/a1/archive", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(500);
    expect(arenaAdminClient.archiveArena).not.toHaveBeenCalled();
  });
});