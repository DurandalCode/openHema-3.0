import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  arenaAdminClient: { listArenas: vi.fn(), createArena: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenasToJson: vi.fn((a) => a),
  arenaToJson: vi.fn((a) => a),
}));

import { arenaAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { arenasToJson, arenaToJson } from "@/lib/grpc/serialize";
import { GET, POST } from "./route";

function getReq(url: string) {
  return new NextRequest(url);
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/arenas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/admin/arenas route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await GET(getReq("http://localhost/api/admin/arenas"));
      expect(res.status).toBe(401);
      expect(arenaAdminClient.listArenas).not.toHaveBeenCalled();
    });

    it("returns arenas JSON on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.listArenas).mockResolvedValue({
        arenas: [{ id: "a1", name: "Ристалище 1" }],
      } as never);
      vi.mocked(arenasToJson).mockReturnValue([{ id: "a1", name: "Ристалище 1" }] as never);

      const res = await GET(getReq("http://localhost/api/admin/arenas?tournamentId=t1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ arenas: [{ id: "a1", name: "Ристалище 1" }] });
      expect(arenaAdminClient.listArenas).toHaveBeenCalledWith(
        { tournamentId: "t1" },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.listArenas).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );
      const res = await GET(getReq("http://localhost/api/admin/arenas"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await POST(postReq({ tournamentId: "t1", name: "A" }));
      expect(res.status).toBe(401);
      expect(arenaAdminClient.createArena).not.toHaveBeenCalled();
    });

    it("returns 400 when tournamentId is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ name: "A" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ tournamentId: "t1", name: "  " }));
      expect(res.status).toBe(400);
    });

    it("creates arena with default description", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.createArena).mockResolvedValue({
        arena: { id: "a1", name: "A" },
      } as never);
      vi.mocked(arenaToJson).mockReturnValue({ id: "a1", name: "A" } as never);

      const res = await POST(postReq({ tournamentId: "t1", name: "A" }));
      expect(res.status).toBe(200);
      expect(arenaAdminClient.createArena).toHaveBeenCalledWith(
        { tournamentId: "t1", name: "A", description: "" },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("passes description when provided", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.createArena).mockResolvedValue({
        arena: { id: "a1" },
      } as never);

      await POST(postReq({ tournamentId: "t1", name: "A", description: "У входа" }));
      expect(arenaAdminClient.createArena).toHaveBeenCalledWith(
        { tournamentId: "t1", name: "A", description: "У входа" },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError PermissionDenied → 403", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.createArena).mockRejectedValue(
        new ConnectError("forbidden", Code.PermissionDenied),
      );
      const res = await POST(postReq({ tournamentId: "t1", name: "A" }));
      expect(res.status).toBe(403);
    });
  });
});