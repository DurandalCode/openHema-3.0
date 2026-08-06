import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { setStageRule: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grpc/serialize")>();
  return {
    ...actual,
    // ruleDtoToProto остаётся реальным — тесты проверяют его выход напрямую.
    stageToJson: vi.fn((s) => s),
  };
});

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { PUT } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/stages/s1/rule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/stages/[stageId]/rule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PUT", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await PUT(req({ rule: null }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(401);
      expect(stageAdminClient.setStageRule).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const badReq = new NextRequest("http://localhost/api/stages/s1/rule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await PUT(badReq, { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(400);
    });

    it("sets rule to undefined (removes rule) when body.rule is null", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.setStageRule).mockResolvedValue({
        stage: { id: "s1" },
      } as never);

      const res = await PUT(req({ rule: null }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(200);
      expect(stageAdminClient.setStageRule).toHaveBeenCalledWith(
        { stageId: "s1", rule: undefined },
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json.stage).toEqual({ id: "s1" });
    });

    it("converts rule DTO to proto plain object and returns updated stage", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.setStageRule).mockResolvedValue({
        stage: { id: "s1", rule: { sourceKind: "STAGE_SOURCE_KIND_STAGE" } },
      } as never);

      const rule = {
        sourceKind: "STAGE_SOURCE_KIND_STAGE",
        sourceStageId: "src1",
        selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
        placeFrom: 1,
        placeTo: 2,
        method: "STAGE_LAYOUT_METHOD_SEEDED",
      };
      const res = await PUT(req({ rule }), { params: Promise.resolve({ stageId: "s1" }) });

      expect(res.status).toBe(200);
      expect(stageAdminClient.setStageRule).toHaveBeenCalledWith(
        {
          stageId: "s1",
          rule: {
            sourceKind: 2,
            sourceStageId: "src1",
            selector: 2,
            placeFrom: 1,
            placeTo: 2,
            method: 2,
          },
        },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError InvalidArgument (invalid rule) → 400", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.setStageRule).mockRejectedValue(
        new ConnectError("invalid rule", Code.InvalidArgument),
      );
      const res = await PUT(req({ rule: null }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(400);
    });

    it("maps ConnectError FailedPrecondition (rule locked) → 409", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.setStageRule).mockRejectedValue(
        new ConnectError("rule locked", Code.FailedPrecondition),
      );
      const res = await PUT(req({ rule: null }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(409);
    });

    it("maps ConnectError NotFound (source stage) → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.setStageRule).mockRejectedValue(
        new ConnectError("stage not found", Code.NotFound),
      );
      const res = await PUT(req({ rule: null }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(404);
    });
  });
});
