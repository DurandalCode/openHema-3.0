import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: { listRoster: vi.fn(), createFighter: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fightersToJson: vi.fn((f) => f),
  fighterToJson: vi.fn((f) => f),
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { fightersToJson, fighterToJson } from "@/lib/grpc/serialize";
import { GET, POST } from "./route";

function getReq(url: string) {
  return new NextRequest(url);
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/fighters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/admin/fighters route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await GET(getReq("http://localhost/api/admin/fighters"));
      expect(res.status).toBe(401);
      expect(fighterAdminClient.listRoster).not.toHaveBeenCalled();
    });

    it("returns roster JSON on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.listRoster).mockResolvedValue({
        fighters: [{ id: "f1", name: "Ivan" }],
      } as never);
      vi.mocked(fightersToJson).mockReturnValue([{ id: "f1", name: "Ivan" }] as never);

      const res = await GET(getReq("http://localhost/api/admin/fighters?tournamentId=t1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ fighters: [{ id: "f1", name: "Ivan" }] });
      expect(fighterAdminClient.listRoster).toHaveBeenCalledWith(
        { tournamentId: "t1" },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.listRoster).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );
      const res = await GET(getReq("http://localhost/api/admin/fighters"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await POST(postReq({ tournamentId: "t1", name: "Ivan" }));
      expect(res.status).toBe(401);
      expect(fighterAdminClient.createFighter).not.toHaveBeenCalled();
    });

    it("returns 400 when tournamentId is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ name: "Ivan" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ tournamentId: "t1", name: "  " }));
      expect(res.status).toBe(400);
    });

    it("creates fighter with defaults for club/nominationIds", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.createFighter).mockResolvedValue({
        fighter: { id: "f1", name: "Ivan" },
      } as never);
      vi.mocked(fighterToJson).mockReturnValue({ id: "f1", name: "Ivan" } as never);

      const res = await POST(postReq({ tournamentId: "t1", name: "Ivan" }));
      expect(res.status).toBe(200);
      expect(fighterAdminClient.createFighter).toHaveBeenCalledWith(
        { tournamentId: "t1", name: "Ivan", club: "", nominationIds: [] },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError PermissionDenied → 403", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.createFighter).mockRejectedValue(
        new ConnectError("forbidden", Code.PermissionDenied),
      );
      const res = await POST(postReq({ tournamentId: "t1", name: "Ivan" }));
      expect(res.status).toBe(403);
    });
  });
});
