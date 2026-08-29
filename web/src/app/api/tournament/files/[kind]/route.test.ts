import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TournamentFileKind } from "@/gen/hema/v1/tournament_pb";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  tournamentAdminClient: {
    uploadTournamentFile: vi.fn(),
    deleteTournamentFile: vi.fn(),
  },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  tournamentToJson: vi.fn((t) => t),
}));

import { tournamentAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { tournamentToJson } from "@/lib/grpc/serialize";
import { DELETE, POST } from "./route";

function ctx(kind: string) {
  return { params: Promise.resolve({ kind }) };
}

function postReq(file: File | null): NextRequest {
  const formData = new FormData();
  if (file) formData.set("file", file);
  return new NextRequest("http://localhost/api/tournament/files/regulations", {
    method: "POST",
    body: formData,
  });
}

function deleteReq(): NextRequest {
  return new NextRequest("http://localhost/api/tournament/files/regulations", {
    method: "DELETE",
  });
}

describe("app/api/tournament/files/[kind] route (spec 0042, T36)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);

      const res = await POST(postReq(new File(["%PDF"], "rules.pdf", { type: "application/pdf" })), ctx("regulations"));

      expect(res.status).toBe(401);
      expect(tournamentAdminClient.uploadTournamentFile).not.toHaveBeenCalled();
    });

    it("returns 400 for an unknown kind, without calling the RPC client", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await POST(
        postReq(new File(["%PDF"], "rules.pdf", { type: "application/pdf" })),
        ctx("something-else"),
      );

      expect(res.status).toBe(400);
      expect(tournamentAdminClient.uploadTournamentFile).not.toHaveBeenCalled();
    });

    it("returns 400 when no file field is present", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await POST(postReq(null), ctx("regulations"));

      expect(res.status).toBe(400);
      expect(tournamentAdminClient.uploadTournamentFile).not.toHaveBeenCalled();
    });

    it("rejects an unsupported file type before calling the RPC client (regulations wants PDF)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await POST(
        postReq(new File(["hi"], "rules.docx", { type: "application/msword" })),
        ctx("regulations"),
      );

      expect(res.status).toBe(400);
      expect(tournamentAdminClient.uploadTournamentFile).not.toHaveBeenCalled();
    });

    it("rejects SVG for the emblem before calling the RPC client (FR-33)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await POST(
        postReq(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })),
        ctx("emblem"),
      );

      expect(res.status).toBe(400);
      expect(tournamentAdminClient.uploadTournamentFile).not.toHaveBeenCalled();
    });

    it("rejects a file over the size threshold before calling the RPC client", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      const big = new Uint8Array(10 * 1024 * 1024 + 1);

      const res = await POST(
        postReq(new File([big], "rules.pdf", { type: "application/pdf" })),
        ctx("regulations"),
      );

      expect(res.status).toBe(400);
      expect(tournamentAdminClient.uploadTournamentFile).not.toHaveBeenCalled();
    });

    it("uploads regulations on the happy path", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
      vi.mocked(tournamentAdminClient.uploadTournamentFile).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      const res = await POST(
        postReq(new File(["%PDF-1.4"], "rules.pdf", { type: "application/pdf" })),
        ctx("regulations"),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ tournament: { id: "t1" } });

      const call = vi.mocked(tournamentAdminClient.uploadTournamentFile).mock.calls[0];
      expect(call[0].kind).toBe(TournamentFileKind.REGULATIONS);
      expect(call[0].fileName).toBe("rules.pdf");
      expect(call[0].contentType).toBe("application/pdf");
      expect(call[0].content).toBeInstanceOf(Uint8Array);
      expect(call[1]).toEqual({ headers: { Authorization: "Bearer tok-xyz" } });
    });

    it("uploads an emblem on the happy path", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.uploadTournamentFile).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      const res = await POST(
        postReq(new File(["\x89PNG"], "logo.png", { type: "image/png" })),
        ctx("emblem"),
      );

      expect(res.status).toBe(200);
      const call = vi.mocked(tournamentAdminClient.uploadTournamentFile).mock.calls[0];
      expect(call[0].kind).toBe(TournamentFileKind.EMBLEM);
    });

    it("maps a ConnectError from the RPC client through errorResponse", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.uploadTournamentFile).mockRejectedValue(
        new ConnectError("tournament: file too large", Code.InvalidArgument),
      );

      const res = await POST(
        postReq(new File(["%PDF"], "rules.pdf", { type: "application/pdf" })),
        ctx("regulations"),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);

      const res = await DELETE(deleteReq(), ctx("regulations"));

      expect(res.status).toBe(401);
      expect(tournamentAdminClient.deleteTournamentFile).not.toHaveBeenCalled();
    });

    it("returns 400 for an unknown kind", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await DELETE(deleteReq(), ctx("nope"));

      expect(res.status).toBe(400);
      expect(tournamentAdminClient.deleteTournamentFile).not.toHaveBeenCalled();
    });

    it("deletes on the happy path", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
      vi.mocked(tournamentAdminClient.deleteTournamentFile).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      const res = await DELETE(deleteReq(), ctx("emblem"));

      expect(res.status).toBe(200);
      const call = vi.mocked(tournamentAdminClient.deleteTournamentFile).mock.calls[0];
      expect(call[0].kind).toBe(TournamentFileKind.EMBLEM);
      expect(call[1]).toEqual({ headers: { Authorization: "Bearer tok-xyz" } });
    });
  });
});
