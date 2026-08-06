import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { seedBracketSlot: vi.fn(), clearBracketSlot: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  bracketToJson: vi.fn((b) => b),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST, DELETE } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/stages/s1/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(body: unknown) {
  return new NextRequest("http://localhost/api/stages/s1/seed", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/stages/[stageId]/seed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await POST(postReq({ fighterId: "f1", slot: 1 }), {
        params: Promise.resolve({ stageId: "s1" }),
      });
      expect(res.status).toBe(401);
      expect(stageAdminClient.seedBracketSlot).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const badReq = new NextRequest("http://localhost/api/stages/s1/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(badReq, { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(400);
    });

    it("returns 400 when fighterId is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ slot: 1 }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(400);
    });

    it("returns 400 when slot is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ fighterId: "f1" }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(400);
    });

    it("seeds the slot and returns bracket JSON on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.seedBracketSlot).mockResolvedValue({
        bracket: { rounds: [] },
      } as never);

      const res = await POST(postReq({ fighterId: "f1", slot: 1 }), {
        params: Promise.resolve({ stageId: "s1" }),
      });
      expect(res.status).toBe(200);
      expect(stageAdminClient.seedBracketSlot).toHaveBeenCalledWith(
        { stageId: "s1", slot: 1, fighterId: "f1" },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError AlreadyExists (occupied slot) → 409", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.seedBracketSlot).mockRejectedValue(
        new ConnectError("slot occupied", Code.FailedPrecondition),
      );
      const res = await POST(postReq({ fighterId: "f1", slot: 1 }), {
        params: Promise.resolve({ stageId: "s1" }),
      });
      expect(res.status).toBe(409);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await DELETE(deleteReq({ slot: 1 }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(401);
      expect(stageAdminClient.clearBracketSlot).not.toHaveBeenCalled();
    });

    it("returns 400 when slot is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await DELETE(deleteReq({}), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(400);
    });

    it("clears the slot and returns bracket JSON on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.clearBracketSlot).mockResolvedValue({
        bracket: { rounds: [] },
      } as never);

      const res = await DELETE(deleteReq({ slot: 1 }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(200);
      expect(stageAdminClient.clearBracketSlot).toHaveBeenCalledWith(
        { stageId: "s1", slot: 1 },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("maps ConnectError FailedPrecondition → 409", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.clearBracketSlot).mockRejectedValue(
        new ConnectError("stage fixed", Code.FailedPrecondition),
      );
      const res = await DELETE(deleteReq({ slot: 1 }), { params: Promise.resolve({ stageId: "s1" }) });
      expect(res.status).toBe(409);
    });
  });
});
