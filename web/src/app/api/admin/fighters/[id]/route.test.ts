import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: { getFighter: vi.fn(), editFighter: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn((f) => f),
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET, PATCH } from "./route";

function ctx() {
  return { params: Promise.resolve({ id: "f1" }) };
}

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/fighters/f1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/admin/fighters/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await GET(new NextRequest("http://localhost/api/admin/fighters/f1"), ctx());
      expect(res.status).toBe(401);
    });

    it("returns fighter on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.getFighter).mockResolvedValue({
        fighter: { id: "f1", name: "Ivan" },
      } as never);
      const res = await GET(new NextRequest("http://localhost/api/admin/fighters/f1"), ctx());
      expect(res.status).toBe(200);
      expect(fighterAdminClient.getFighter).toHaveBeenCalledWith(
        { fighterId: "f1" },
        { headers: { Authorization: "Bearer token" } },
      );
    });
  });

  describe("PATCH", () => {
    it("returns 400 when name is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await PATCH(patchReq({ name: "  " }), ctx());
      expect(res.status).toBe(400);
      expect(fighterAdminClient.editFighter).not.toHaveBeenCalled();
    });

    it("edits fighter on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.editFighter).mockResolvedValue({
        fighter: { id: "f1", name: "Ivan Petrov" },
      } as never);
      const res = await PATCH(patchReq({ name: "Ivan Petrov", club: "Club Y" }), ctx());
      expect(res.status).toBe(200);
      expect(fighterAdminClient.editFighter).toHaveBeenCalledWith(
        { fighterId: "f1", name: "Ivan Petrov", club: "Club Y" },
        { headers: { Authorization: "Bearer token" } },
      );
    });
  });
});
