import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  nominationClient: { listNominations: vi.fn() },
  nominationAdminClient: { createNomination: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationToJson: vi.fn((n) => n),
  nominationsToJson: vi.fn((n) => n),
}));

import {
  nominationAdminClient,
  nominationClient,
} from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { nominationToJson, nominationsToJson } from "@/lib/grpc/serialize";
import { GET, POST } from "./route";

function req(url: string) {
  return new NextRequest(url);
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/nominations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns nominations JSON on ok", async () => {
      vi.mocked(nominationClient.listNominations).mockResolvedValue({
        nominations: [{ id: "n1", title: "A" }],
      } as never);
      vi.mocked(nominationsToJson).mockReturnValue([{ id: "n1", title: "A" }] as never);

      const res = await GET(req("http://localhost/api/nominations?tournamentId=t1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ nominations: [{ id: "n1", title: "A" }] });
      expect(nominationClient.listNominations).toHaveBeenCalledWith({ tournamentId: "t1" });
    });

    it("returns 400 when tournamentId is missing", async () => {
      const res = await GET(req("http://localhost/api/nominations"));
      expect(res.status).toBe(400);
      expect(nominationClient.listNominations).not.toHaveBeenCalled();
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(nominationClient.listNominations).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );

      const res = await GET(req("http://localhost/api/nominations?tournamentId=t1"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);

      const res = await POST(postReq({ tournamentId: "t1", title: "T" }));
      expect(res.status).toBe(401);
      expect(nominationAdminClient.createNomination).not.toHaveBeenCalled();
    });

    it("returns 400 when tournamentId is missing", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await POST(postReq({ title: "T" }));
      expect(res.status).toBe(400);
      expect(nominationAdminClient.createNomination).not.toHaveBeenCalled();
    });

    it("returns 400 on empty title", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await POST(postReq({ tournamentId: "t1", title: "   " }));
      expect(res.status).toBe(400);
      expect(nominationAdminClient.createNomination).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      const badReq = new NextRequest("http://localhost/api/nominations", {
        method: "POST",
        body: "not-json",
      });

      const res = await POST(badReq);
      expect(res.status).toBe(400);
    });

    it("forwards fields + Bearer token on happy path", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
      vi.mocked(nominationAdminClient.createNomination).mockResolvedValue({
        nomination: { id: "n1", title: "Лонгсворд" },
      } as never);
      vi.mocked(nominationToJson).mockReturnValue({ id: "n1", title: "Лонгсворд" } as never);

      const res = await POST(
        postReq({
          tournamentId: "t1",
          title: "Лонгсворд",
          description: "Desc",
          fighterCapacity: 16,
          metadata: { rulesUrl: "https://example.com/rules" },
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ nomination: { id: "n1", title: "Лонгсворд" } });

      const call = vi.mocked(nominationAdminClient.createNomination).mock.calls[0];
      expect(call[1]).toEqual({ headers: { Authorization: "Bearer tok-xyz" } });
      expect(call[0]).toEqual({
        tournamentId: "t1",
        title: "Лонгсворд",
        description: "Desc",
        fighterCapacity: 16,
        metadata: { rulesUrl: "https://example.com/rules" },
      });
    });

    it("omits fighterCapacity and rulesUrl when absent", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(nominationAdminClient.createNomination).mockResolvedValue({
        nomination: { id: "n1" },
      } as never);
      vi.mocked(nominationToJson).mockReturnValue({ id: "n1" } as never);

      await POST(postReq({ tournamentId: "t1", title: "T" }));
      const reqMsg = vi.mocked(nominationAdminClient.createNomination).mock.calls[0][0];
      expect(reqMsg.fighterCapacity).toBeUndefined();
      expect(reqMsg.metadata).toEqual({});
    });

    it("preserves explicit zero fighterCapacity", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(nominationAdminClient.createNomination).mockResolvedValue({
        nomination: { id: "n1" },
      } as never);
      vi.mocked(nominationToJson).mockReturnValue({ id: "n1" } as never);

      await POST(postReq({ tournamentId: "t1", title: "T", fighterCapacity: 0 }));
      const reqMsg = vi.mocked(nominationAdminClient.createNomination).mock.calls[0][0];
      expect(reqMsg.fighterCapacity).toBe(0);
    });

    it("maps ConnectError AlreadyExists → 409", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(nominationAdminClient.createNomination).mockRejectedValue(
        new ConnectError("duplicate", Code.AlreadyExists),
      );

      const res = await POST(postReq({ tournamentId: "t1", title: "T" }));
      expect(res.status).toBe(409);
    });
  });
});
