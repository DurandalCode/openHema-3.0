import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  arenaAdminClient: { getArena: vi.fn(), updateArena: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaToJson: vi.fn((a) => a),
}));

import { arenaAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { arenaToJson } from "@/lib/grpc/serialize";
import { GET, PATCH } from "./route";

function patchReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/arenas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/admin/arenas/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const req = new NextRequest("http://localhost/api/admin/arenas/a1");
      const res = await GET(req, { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(401);
      expect(arenaAdminClient.getArena).not.toHaveBeenCalled();
    });

    it("returns arena JSON on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.getArena).mockResolvedValue({
        arena: { id: "a1", name: "A" },
      } as never);
      vi.mocked(arenaToJson).mockReturnValue({ id: "a1", name: "A" } as never);

      const req = new NextRequest("http://localhost/api/admin/arenas/a1");
      const res = await GET(req, { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ arena: { id: "a1", name: "A" } });
      expect(arenaAdminClient.getArena).toHaveBeenCalledWith(
        { id: "a1" },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.getArena).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );
      const req = new NextRequest("http://localhost/api/admin/arenas/a1");
      const res = await GET(req, { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await PATCH(patchReq("a1", { name: "New" }), { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(401);
      expect(arenaAdminClient.updateArena).not.toHaveBeenCalled();
    });

    it("returns 400 when name is empty", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await PATCH(patchReq("a1", { name: "  " }), { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(400);
    });

    it("updates arena with default description", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.updateArena).mockResolvedValue({
        arena: { id: "a1", name: "New" },
      } as never);
      vi.mocked(arenaToJson).mockReturnValue({ id: "a1", name: "New" } as never);

      const res = await PATCH(patchReq("a1", { name: "New" }), { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(200);
      expect(arenaAdminClient.updateArena).toHaveBeenCalledWith(
        { id: "a1", name: "New", description: "" },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(arenaAdminClient.updateArena).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );
      const res = await PATCH(patchReq("a1", { name: "X" }), { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(404);
    });
  });
});