import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { restoreBuiltinPresets: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  formatPresetsToJson: vi.fn((p) => p ?? []),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function postReq() {
  return new NextRequest("http://localhost/api/formats/restore", { method: "POST" });
}

describe("app/api/formats/restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await POST(postReq());
      expect(res.status).toBe(401);
      expect(stageAdminClient.restoreBuiltinPresets).not.toHaveBeenCalled();
    });

    it("restores builtin presets and returns {restored, skipped} on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.restoreBuiltinPresets).mockResolvedValue({
        restored: [{ id: "p1" }],
        skipped: 2,
      } as never);

      const res = await POST(postReq());

      expect(res.status).toBe(200);
      expect(stageAdminClient.restoreBuiltinPresets).toHaveBeenCalledWith(
        {},
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json).toEqual({ restored: [{ id: "p1" }], skipped: 2 });
    });

    it("maps ConnectError to an HTTP status via errorResponse", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.restoreBuiltinPresets).mockRejectedValue(
        new ConnectError("internal error", Code.Internal),
      );
      const res = await POST(postReq());
      expect(res.status).toBe(500);
    });
  });
});
