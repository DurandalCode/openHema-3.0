import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactType } from "@/gen/hema/v1/tournament_pb";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  tournamentClient: { getActiveTournament: vi.fn() },
  tournamentAdminClient: { updateActiveTournament: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  tournamentToJson: vi.fn((t) => t),
}));

import {
  tournamentAdminClient,
  tournamentClient,
} from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { tournamentToJson } from "@/lib/grpc/serialize";
import { GET, PUT } from "./route";

describe("app/api/tournament route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns tournament JSON on ok", async () => {
      vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
        tournament: { id: "t1", title: "Cup" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1", title: "Cup" } as never);

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ tournament: { id: "t1", title: "Cup" } });
    });

    it("maps ConnectError NotFound → 404", async () => {
      vi.mocked(tournamentClient.getActiveTournament).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );

      const res = await GET();
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("not found");
    });
  });

  describe("PUT", () => {
    function putReq(body: unknown) {
      return new NextRequest("http://localhost/api/tournament", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);

      const res = await PUT(putReq({ title: "T" }));
      expect(res.status).toBe(401);
      expect(tournamentAdminClient.updateActiveTournament).not.toHaveBeenCalled();
    });

    it("returns 400 on empty title", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await PUT(putReq({ title: "   " }));
      expect(res.status).toBe(400);
      expect(tournamentAdminClient.updateActiveTournament).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid json", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      const req = new NextRequest("http://localhost/api/tournament", {
        method: "PUT",
        body: "not-json",
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    it("forwards fields + contacts + Bearer token on happy path", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1", title: "Cup" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1", title: "Cup" } as never);

      const res = await PUT(
        putReq({
          title: "Cup",
          description: "Desc",
          emblemUrl: "https://cdn/x.png",
          eventStartAt: "2026-12-01T10:00:00.000Z",
          eventEndAt: "2026-12-03T18:00:00.000Z",
          contacts: [
            { type: "CONTACT_TYPE_TELEGRAM", value: "@org" },
            { type: "CONTACT_TYPE_WEBSITE", value: "https://x.test" },
          ],
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ tournament: { id: "t1", title: "Cup" } });

      const call = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0];
      expect(call[1]).toEqual({
        headers: { Authorization: "Bearer tok-xyz" },
      });
      const reqMsg = call[0];
      expect(reqMsg.title).toBe("Cup");
      expect(reqMsg.description).toBe("Desc");
      expect(reqMsg.emblemUrl).toBe("https://cdn/x.png");
      // BFF переводит строковые имена enum из UI в числовые значения proto
      // (поле ContactInput.type — int32; строка → NaN при binary-сериализации).
      expect(reqMsg.contacts).toEqual([
        { type: ContactType.TELEGRAM, value: "@org" },
        { type: ContactType.WEBSITE, value: "https://x.test" },
      ]);
      expect(reqMsg.eventStartAt).toBeDefined();
      expect(reqMsg.eventEndAt).toBeDefined();
    });

    it("returns 400 on unknown contact type", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await PUT(
        putReq({
          title: "Cup",
          contacts: [{ type: "CONTACT_TYPE_WHATEVER", value: "x" }],
        }),
      );
      expect(res.status).toBe(400);
      expect(tournamentAdminClient.updateActiveTournament).not.toHaveBeenCalled();
    });

    it("omits eventStartAt and eventEndAt when absent", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      await PUT(putReq({ title: "Cup" }));
      const reqMsg = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0][0];
      expect(reqMsg.eventStartAt).toBeUndefined();
      expect(reqMsg.eventEndAt).toBeUndefined();
    });

    it("maps ConnectError InvalidArgument → 400", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockRejectedValue(
        new ConnectError("bad input", Code.InvalidArgument),
      );

      const res = await PUT(putReq({ title: "Cup" }));
      expect(res.status).toBe(400);
    });
  });
});