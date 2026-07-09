import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  nominationClient: { getNomination: vi.fn() },
  nominationAdminClient: { updateNomination: vi.fn(), deleteNomination: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationToJson: vi.fn((n) => n),
}));

import {
  nominationAdminClient,
  nominationClient,
} from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { nominationToJson } from "@/lib/grpc/serialize";
import { GET, PUT, DELETE } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/nominations/n1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns nomination JSON on ok", async () => {
      vi.mocked(nominationClient.getNomination).mockResolvedValue({
        nomination: { id: "n1", title: "A" },
      } as never);
      vi.mocked(nominationToJson).mockReturnValue({ id: "n1", title: "A" } as never);

      const res = await GET(new NextRequest("http://localhost/api/nominations/n1"), ctx("n1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ nomination: { id: "n1", title: "A" } });
      expect(nominationClient.getNomination).toHaveBeenCalledWith({ id: "n1" });
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(nominationClient.getNomination).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );

      const res = await GET(new NextRequest("http://localhost/api/nominations/n1"), ctx("n1"));
      expect(res.status).toBe(404);
    });
  });

  describe("PUT", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);

      const res = await PUT(putReq({ title: "T" }), ctx("n1"));
      expect(res.status).toBe(401);
      expect(nominationAdminClient.updateNomination).not.toHaveBeenCalled();
    });

    it("returns 400 on empty title", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await PUT(putReq({ title: "   " }), ctx("n1"));
      expect(res.status).toBe(400);
      expect(nominationAdminClient.updateNomination).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      const badReq = new NextRequest("http://localhost/api/nominations/n1", {
        method: "PUT",
        body: "not-json",
      });

      const res = await PUT(badReq, ctx("n1"));
      expect(res.status).toBe(400);
    });

    it("forwards id + fields + Bearer token on happy path", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
      vi.mocked(nominationAdminClient.updateNomination).mockResolvedValue({
        nomination: { id: "n1", title: "New" },
      } as never);
      vi.mocked(nominationToJson).mockReturnValue({ id: "n1", title: "New" } as never);

      const res = await PUT(
        putReq({
          title: "New",
          description: "Desc",
          fighterCapacity: 10,
          metadata: { rulesUrl: "https://example.com/new" },
        }),
        ctx("n1"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ nomination: { id: "n1", title: "New" } });

      const call = vi.mocked(nominationAdminClient.updateNomination).mock.calls[0];
      expect(call[1]).toEqual({ headers: { Authorization: "Bearer tok-xyz" } });
      expect(call[0]).toEqual({
        id: "n1",
        title: "New",
        description: "Desc",
        fighterCapacity: 10,
        metadata: { rulesUrl: "https://example.com/new" },
      });
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(nominationAdminClient.updateNomination).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );

      const res = await PUT(putReq({ title: "T" }), ctx("does-not-exist"));
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);

      const res = await DELETE(new NextRequest("http://localhost/api/nominations/n1"), ctx("n1"));
      expect(res.status).toBe(401);
      expect(nominationAdminClient.deleteNomination).not.toHaveBeenCalled();
    });

    it("deletes and returns 200 with Bearer token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
      vi.mocked(nominationAdminClient.deleteNomination).mockResolvedValue({} as never);

      const res = await DELETE(new NextRequest("http://localhost/api/nominations/n1"), ctx("n1"));
      expect(res.status).toBe(200);
      const call = vi.mocked(nominationAdminClient.deleteNomination).mock.calls[0];
      expect(call[0]).toEqual({ id: "n1" });
      expect(call[1]).toEqual({ headers: { Authorization: "Bearer tok-xyz" } });
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(nominationAdminClient.deleteNomination).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );

      const res = await DELETE(new NextRequest("http://localhost/api/nominations/n1"), ctx("n1"));
      expect(res.status).toBe(404);
    });
  });
});
