import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { listStages: vi.fn(), createStage: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  stageToJson: vi.fn((s) => s),
  stagesToJson: vi.fn((s) => s ?? []),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET, POST } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/nominations/n1/stages");
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/nominations/n1/stages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations/[id]/stages route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
      expect(res.status).toBe(401);
      expect(stageAdminClient.listStages).not.toHaveBeenCalled();
    });

    it("lists stages and returns JSON on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.listStages).mockResolvedValue({
        stages: [{ id: "s1" }],
      } as never);

      const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
      expect(res.status).toBe(200);
      expect(stageAdminClient.listStages).toHaveBeenCalledWith(
        { nominationId: "n1" },
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json.stages).toEqual([{ id: "s1" }]);
    });
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await POST(
        postReq({ type: "bracket", title: "Плейофф", bracketSize: 8, thirdPlace: true }),
        { params: Promise.resolve({ id: "n1" }) },
      );
      expect(res.status).toBe(401);
      expect(stageAdminClient.createStage).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const req = new NextRequest("http://localhost/api/nominations/n1/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req, { params: Promise.resolve({ id: "n1" }) });
      expect(res.status).toBe(400);
    });

    it("returns 400 when type is not 'bracket'", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(
        postReq({ type: "groups", title: "T", bracketSize: 8, thirdPlace: false }),
        { params: Promise.resolve({ id: "n1" }) },
      );
      expect(res.status).toBe(400);
      expect(stageAdminClient.createStage).not.toHaveBeenCalled();
    });

    it("returns 400 when title is empty", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(
        postReq({ type: "bracket", title: "  ", bracketSize: 8, thirdPlace: false }),
        { params: Promise.resolve({ id: "n1" }) },
      );
      expect(res.status).toBe(400);
      expect(stageAdminClient.createStage).not.toHaveBeenCalled();
    });

    it("returns 400 when bracketSize is not one of 4/8/16/32", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(
        postReq({ type: "bracket", title: "T", bracketSize: 6, thirdPlace: false }),
        { params: Promise.resolve({ id: "n1" }) },
      );
      expect(res.status).toBe(400);
      expect(stageAdminClient.createStage).not.toHaveBeenCalled();
    });

    it("creates a bracket stage and returns created + stages on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.createStage).mockResolvedValue({
        created: { id: "s2" },
        stages: [{ id: "s1" }, { id: "s2" }],
      } as never);

      const res = await POST(
        postReq({ type: "bracket", title: "Плейофф", bracketSize: 8, thirdPlace: true }),
        { params: Promise.resolve({ id: "n1" }) },
      );

      expect(res.status).toBe(200);
      expect(stageAdminClient.createStage).toHaveBeenCalledWith(
        {
          nominationId: "n1",
          type: 2,
          title: "Плейофф",
          bracket: { size: 8, thirdPlace: true },
        },
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json.created).toEqual({ id: "s2" });
      expect(json.stages).toEqual([{ id: "s1" }, { id: "s2" }]);
    });

    it("maps ConnectError InvalidArgument → 400", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.createStage).mockRejectedValue(
        new ConnectError("bad size", Code.InvalidArgument),
      );
      const res = await POST(
        postReq({ type: "bracket", title: "T", bracketSize: 8, thirdPlace: false }),
        { params: Promise.resolve({ id: "n1" }) },
      );
      expect(res.status).toBe(400);
    });
  });
});
