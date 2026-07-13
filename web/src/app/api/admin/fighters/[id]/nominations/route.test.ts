import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: { addToNomination: vi.fn(), removeFromNomination: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn((f) => f),
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST, DELETE } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/fighters/f1/nominations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(url: string) {
  return new NextRequest(url, { method: "DELETE" });
}

function ctx() {
  return { params: Promise.resolve({ id: "f1" }) };
}

describe("app/api/admin/fighters/[id]/nominations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST (add)", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await POST(postReq({ nominationId: "n1" }), ctx());
      expect(res.status).toBe(401);
    });

    it("returns 400 when nominationId missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({}), ctx());
      expect(res.status).toBe(400);
      expect(fighterAdminClient.addToNomination).not.toHaveBeenCalled();
    });

    it("adds participation on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.addToNomination).mockResolvedValue({
        fighter: { id: "f1" },
      } as never);
      const res = await POST(postReq({ nominationId: "n1" }), ctx());
      expect(res.status).toBe(200);
      expect(fighterAdminClient.addToNomination).toHaveBeenCalledWith(
        { fighterId: "f1", nominationId: "n1" },
        { headers: { Authorization: "Bearer token" } },
      );
    });
  });

  describe("DELETE (remove)", () => {
    it("returns 400 when nominationId missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await DELETE(
        deleteReq("http://localhost/api/admin/fighters/f1/nominations"),
        ctx(),
      );
      expect(res.status).toBe(400);
      expect(fighterAdminClient.removeFromNomination).not.toHaveBeenCalled();
    });

    it("removes participation on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(fighterAdminClient.removeFromNomination).mockResolvedValue({
        fighter: { id: "f1" },
      } as never);
      const res = await DELETE(
        deleteReq("http://localhost/api/admin/fighters/f1/nominations?nominationId=n1"),
        ctx(),
      );
      expect(res.status).toBe(200);
      expect(fighterAdminClient.removeFromNomination).toHaveBeenCalledWith(
        { fighterId: "f1", nominationId: "n1" },
        { headers: { Authorization: "Bearer token" } },
      );
    });
  });
});
