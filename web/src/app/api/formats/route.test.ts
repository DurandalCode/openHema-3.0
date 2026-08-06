import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { listFormatPresets: vi.fn(), saveFormatPreset: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  formatPresetsToJson: vi.fn((p) => p ?? []),
  formatPresetToJson: vi.fn((p) => p ?? null),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET, POST } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/formats");
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/formats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/formats route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await GET(getReq());
      expect(res.status).toBe(401);
      expect(stageAdminClient.listFormatPresets).not.toHaveBeenCalled();
    });

    it("lists presets and returns JSON on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.listFormatPresets).mockResolvedValue({
        presets: [{ id: "p1" }],
      } as never);

      const res = await GET(getReq());
      expect(res.status).toBe(200);
      expect(stageAdminClient.listFormatPresets).toHaveBeenCalledWith(
        {},
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json.presets).toEqual([{ id: "p1" }]);
    });
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await POST(postReq({ name: "Формат", nominationId: "n1" }));
      expect(res.status).toBe(401);
      expect(stageAdminClient.saveFormatPreset).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const badReq = new NextRequest("http://localhost/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(badReq);
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is empty", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ name: "  ", nominationId: "n1" }));
      expect(res.status).toBe(400);
      expect(stageAdminClient.saveFormatPreset).not.toHaveBeenCalled();
    });

    it("returns 400 when nominationId is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ name: "Формат" }));
      expect(res.status).toBe(400);
      expect(stageAdminClient.saveFormatPreset).not.toHaveBeenCalled();
    });

    it("saves a preset and returns it on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.saveFormatPreset).mockResolvedValue({
        preset: { id: "p1", name: "Формат" },
      } as never);

      const res = await POST(postReq({ name: "Формат", nominationId: "n1" }));

      expect(res.status).toBe(200);
      expect(stageAdminClient.saveFormatPreset).toHaveBeenCalledWith(
        { name: "Формат", nominationId: "n1" },
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json.preset).toEqual({ id: "p1", name: "Формат" });
    });

    it("maps ConnectError AlreadyExists → 409 (preset name taken)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.saveFormatPreset).mockRejectedValue(
        new ConnectError("name taken", Code.AlreadyExists),
      );
      const res = await POST(postReq({ name: "Формат", nominationId: "n1" }));
      expect(res.status).toBe(409);
    });

    it("maps ConnectError FailedPrecondition → 409 (source not applicable)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.saveFormatPreset).mockRejectedValue(
        new ConnectError("empty schema", Code.FailedPrecondition),
      );
      const res = await POST(postReq({ name: "Формат", nominationId: "n1" }));
      expect(res.status).toBe(409);
    });
  });
});
