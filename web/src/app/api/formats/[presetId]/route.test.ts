import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { renameFormatPreset: vi.fn(), deleteFormatPreset: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  formatPresetToJson: vi.fn((p) => p ?? null),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { DELETE, PATCH } from "./route";

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/formats/p1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq() {
  return new NextRequest("http://localhost/api/formats/p1", { method: "DELETE" });
}

describe("app/api/formats/[presetId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PATCH", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await PATCH(patchReq({ name: "Новое имя" }), {
        params: Promise.resolve({ presetId: "p1" }),
      });
      expect(res.status).toBe(401);
      expect(stageAdminClient.renameFormatPreset).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const badReq = new NextRequest("http://localhost/api/formats/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await PATCH(badReq, { params: Promise.resolve({ presetId: "p1" }) });
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is empty", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await PATCH(patchReq({ name: "  " }), {
        params: Promise.resolve({ presetId: "p1" }),
      });
      expect(res.status).toBe(400);
      expect(stageAdminClient.renameFormatPreset).not.toHaveBeenCalled();
    });

    it("renames a preset and returns it on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.renameFormatPreset).mockResolvedValue({
        preset: { id: "p1", name: "Новое имя" },
      } as never);

      const res = await PATCH(patchReq({ name: "Новое имя" }), {
        params: Promise.resolve({ presetId: "p1" }),
      });

      expect(res.status).toBe(200);
      expect(stageAdminClient.renameFormatPreset).toHaveBeenCalledWith(
        { presetId: "p1", name: "Новое имя" },
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json.preset).toEqual({ id: "p1", name: "Новое имя" });
    });

    it("maps ConnectError AlreadyExists → 409 (preset name taken)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.renameFormatPreset).mockRejectedValue(
        new ConnectError("name taken", Code.AlreadyExists),
      );
      const res = await PATCH(patchReq({ name: "Занято" }), {
        params: Promise.resolve({ presetId: "p1" }),
      });
      expect(res.status).toBe(409);
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.renameFormatPreset).mockRejectedValue(
        new ConnectError("preset not found", Code.NotFound),
      );
      const res = await PATCH(patchReq({ name: "Имя" }), {
        params: Promise.resolve({ presetId: "missing" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await DELETE(deleteReq(), { params: Promise.resolve({ presetId: "p1" }) });
      expect(res.status).toBe(401);
      expect(stageAdminClient.deleteFormatPreset).not.toHaveBeenCalled();
    });

    it("deletes a preset and returns an empty body on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.deleteFormatPreset).mockResolvedValue({} as never);

      const res = await DELETE(deleteReq(), { params: Promise.resolve({ presetId: "p1" }) });

      expect(res.status).toBe(200);
      expect(stageAdminClient.deleteFormatPreset).toHaveBeenCalledWith(
        { presetId: "p1" },
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json).toEqual({});
    });

    it("maps ConnectError NotFound → 404 (preset doesn't exist)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.deleteFormatPreset).mockRejectedValue(
        new ConnectError("preset not found", Code.NotFound),
      );
      const res = await DELETE(deleteReq(), { params: Promise.resolve({ presetId: "missing" }) });
      expect(res.status).toBe(404);
    });
  });
});
