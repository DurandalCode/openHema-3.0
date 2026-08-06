import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { deleteStage: vi.fn(), updateStage: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  stagesToJson: vi.fn((s) => s ?? []),
  stageToJson: vi.fn((s) => s ?? null),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { DELETE, PATCH } from "./route";

function req() {
  return new NextRequest("http://localhost/api/stages/s1", { method: "DELETE" });
}

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/stages/s1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/stages/[stageId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await DELETE(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.deleteStage).not.toHaveBeenCalled();
  });

  it("deletes the stage and returns the remaining stages on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.deleteStage).mockResolvedValue({
      stages: [{ id: "s2" }],
    } as never);

    const res = await DELETE(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(200);
    expect(stageAdminClient.deleteStage).toHaveBeenCalledWith(
      { stageId: "s1" },
      { headers: { Authorization: "Bearer token" } },
    );
    const json = await res.json();
    expect(json.stages).toEqual([{ id: "s2" }]);
  });

  it("maps ConnectError FailedPrecondition → 409 (groups stage / started bouts)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.deleteStage).mockRejectedValue(
      new ConnectError("not deletable", Code.FailedPrecondition),
    );
    const res = await DELETE(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(409);
  });

  describe("PATCH", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await PATCH(patchReq({ title: "Новое название" }), {
        params: Promise.resolve({ stageId: "s1" }),
      });
      expect(res.status).toBe(401);
      expect(stageAdminClient.updateStage).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const badReq = new NextRequest("http://localhost/api/stages/s1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await PATCH(badReq, { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(400);
      expect(stageAdminClient.updateStage).not.toHaveBeenCalled();
    });

    it("returns 400 when title is empty", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await PATCH(patchReq({ title: "  " }), {
        params: Promise.resolve({ stageId: "s1" }),
      });
      expect(res.status).toBe(400);
      expect(stageAdminClient.updateStage).not.toHaveBeenCalled();
    });

    it("renames a stage and returns the updated stage on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.updateStage).mockResolvedValue({
        stage: { id: "s1", title: "Новое название" },
      } as never);

      const res = await PATCH(patchReq({ title: "Новое название" }), {
        params: Promise.resolve({ stageId: "s1" }),
      });

      expect(res.status).toBe(200);
      expect(stageAdminClient.updateStage).toHaveBeenCalledWith(
        { stageId: "s1", title: "Новое название", bracket: undefined, groups: undefined },
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json.stage).toEqual({ id: "s1", title: "Новое название" });
    });

    it("passes bracket config through to updateStage when provided", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.updateStage).mockResolvedValue({
        stage: { id: "s1" },
      } as never);

      const res = await PATCH(
        patchReq({ title: "Плейофф", bracket: { size: 16, thirdPlace: true } }),
        { params: Promise.resolve({ stageId: "s1" }) },
      );

      expect(res.status).toBe(200);
      expect(stageAdminClient.updateStage).toHaveBeenCalledWith(
        {
          stageId: "s1",
          title: "Плейофф",
          bracket: { size: 16, thirdPlace: true },
          groups: undefined,
        },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError FailedPrecondition → 409 (config change with non-empty composition)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.updateStage).mockRejectedValue(
        new ConnectError("stage locked", Code.FailedPrecondition),
      );
      const res = await PATCH(patchReq({ title: "T", groups: { groupCount: 3 } }), {
        params: Promise.resolve({ stageId: "s1" }),
      });
      expect(res.status).toBe(409);
    });

    it("maps ConnectError InvalidArgument → 400 (config doesn't match stage type)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.updateStage).mockRejectedValue(
        new ConnectError("bad config", Code.InvalidArgument),
      );
      const res = await PATCH(patchReq({ title: "T", groups: { groupCount: 0 } }), {
        params: Promise.resolve({ stageId: "s1" }),
      });
      expect(res.status).toBe(400);
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.updateStage).mockRejectedValue(
        new ConnectError("stage not found", Code.NotFound),
      );
      const res = await PATCH(patchReq({ title: "T" }), {
        params: Promise.resolve({ stageId: "s1" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
