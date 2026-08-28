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

    it("returns roster JSON on ok, including fromApplication, with default page/pageSize (spec 0041)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.listRoster).mockResolvedValue({
        fighters: [{ id: "f1", name: "Ivan" }],
        totalCount: 1,
        statusCounts: [
          { status: 1, count: 1 },
          { status: 2, count: 0 },
        ],
      } as never);
      vi.mocked(fightersToJson).mockReturnValue([
        { id: "f1", name: "Ivan", fromApplication: true },
      ] as never);

      const res = await GET(getReq("http://localhost/api/admin/fighters?tournamentId=t1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        fighters: [{ id: "f1", name: "Ivan", fromApplication: true }],
        totalCount: 1,
        statusCounts: { active: 1, withdrawn: 0 },
      });
      expect(fighterAdminClient.listRoster).toHaveBeenCalledWith(
        {
          tournamentId: "t1",
          statuses: [],
          nominationIds: [],
          clubs: [],
          includeNoClub: false,
          search: undefined,
          limit: 20,
          offset: 0,
        },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps statuses[]/nominationIds[]/clubs[]/includeNoClub/search/page/pageSize onto the gRPC filter (spec 0041, FR-1..FR-3)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.listRoster).mockResolvedValue({
        fighters: [],
        totalCount: 0,
        statusCounts: [],
      } as never);
      vi.mocked(fightersToJson).mockReturnValue([] as never);

      const url =
        "http://localhost/api/admin/fighters" +
        "?tournamentId=t1" +
        "&statuses=FIGHTER_STATUS_ACTIVE&statuses=FIGHTER_STATUS_WITHDRAWN" +
        "&nominationIds=n1" +
        "&clubs=Клинок+Севера" +
        "&includeNoClub=1" +
        "&search=иван" +
        "&page=2&pageSize=50";
      const res = await GET(getReq(url));
      expect(res.status).toBe(200);
      expect(fighterAdminClient.listRoster).toHaveBeenCalledWith(
        {
          tournamentId: "t1",
          statuses: [1, 2],
          nominationIds: ["n1"],
          clubs: ["Клинок Севера"],
          includeNoClub: true,
          search: "иван",
          limit: 50,
          offset: 50, // (page - 1) * pageSize = (2 - 1) * 50
        },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("returns 400 on an unknown status label", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await GET(getReq("http://localhost/api/admin/fighters?statuses=NOT_A_STATUS"));
      expect(res.status).toBe(400);
      expect(fighterAdminClient.listRoster).not.toHaveBeenCalled();
    });

    it("falls back to page 1 / default pageSize on invalid page/pageSize", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.listRoster).mockResolvedValue({
        fighters: [],
        totalCount: 0,
        statusCounts: [],
      } as never);
      vi.mocked(fightersToJson).mockReturnValue([] as never);

      await GET(getReq("http://localhost/api/admin/fighters?tournamentId=t1&page=0&pageSize=-5"));
      expect(fighterAdminClient.listRoster).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 0 }),
        expect.anything(),
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
