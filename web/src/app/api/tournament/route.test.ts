import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const getCurrentUserMock = vi.fn();
vi.mock("@/entities/user/model/get-current-user", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

import {
  tournamentAdminClient,
  tournamentClient,
} from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { tournamentToJson } from "@/lib/grpc/serialize";
import { GET, PUT } from "./route";

describe("app/api/tournament route", () => {
  const originalPreprodMode = process.env.PREPROD_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.PREPROD_MODE = originalPreprodMode;
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

    // spec 0046, T4: гейт preprod-доступа — гость без сессии получает 401 и
    // апстрим не вызывается; залогиненный пользователь проходит как раньше.
    it("returns 401 for a guest in preprod mode and does not call upstream", async () => {
      process.env.PREPROD_MODE = "true";
      getCurrentUserMock.mockResolvedValue(null);

      const res = await GET();

      expect(res.status).toBe(401);
      expect(tournamentClient.getActiveTournament).not.toHaveBeenCalled();
    });

    it("lets an authenticated user through in preprod mode", async () => {
      process.env.PREPROD_MODE = "true";
      getCurrentUserMock.mockResolvedValue({
        id: "u1",
        email: "user@hema.test",
        displayName: "Боец",
        role: "ROLE_USER",
        createdAt: "",
      });
      vi.mocked(tournamentClient.getActiveTournament).mockResolvedValue({
        tournament: { id: "t1", title: "Cup" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1", title: "Cup" } as never);

      const res = await GET();

      expect(res.status).toBe(200);
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

    // spec 0037, FR-22: UpdateActiveTournament заменяет профиль целиком —
    // если BFF не форвардит новые поля, сохранение любой другой правки молча
    // обнуляет судью/регламент/место/взнос на сервере.
    it("forwards profile-extras fields (chiefJudge/regulationsUrl/venue/entryFee)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      await PUT(
        putReq({
          title: "Cup",
          chiefJudge: "Мазурова Е.",
          regulationsUrl: "https://cdn/regs.pdf",
          venueName: "Северный манеж",
          venueAddress: "Вологда, ул. Мира 14",
          entryFeeMinor: 150000,
          entryFeeCurrency: "RUB",
        }),
      );

      const reqMsg = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0][0];
      expect(reqMsg.chiefJudge).toBe("Мазурова Е.");
      expect(reqMsg.regulationsUrl).toBe("https://cdn/regs.pdf");
      expect(reqMsg.venueName).toBe("Северный манеж");
      expect(reqMsg.venueAddress).toBe("Вологда, ул. Мира 14");
      expect(reqMsg.entryFeeMinor).toBe(150000n);
      expect(reqMsg.entryFeeCurrency).toBe("RUB");
    });

    it("omits entryFeeMinor when null (not-set differs from zero, FR-21)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      await PUT(putReq({ title: "Cup", entryFeeMinor: null }));

      const reqMsg = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0][0];
      expect(reqMsg.entryFeeMinor).toBeUndefined();
    });

    it("forwards entryFeeMinor = 0 (free entry, distinct from not-set)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      await PUT(putReq({ title: "Cup", entryFeeMinor: 0, entryFeeCurrency: "RUB" }));

      const reqMsg = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0][0];
      expect(reqMsg.entryFeeMinor).toBe(0n);
    });

    // BigInt() бросает RangeError на нецелом числе; без явной проверки эта
    // ошибка вылетает необработанной за пределы try/catch маршрута —
    // 500 вместо аккуратного {error,status}, в отличие от всех остальных
    // проверок ввода в этом файле.
    it("returns 400 (not a thrown 500) when entryFeeMinor is not an integer", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");

      const res = await PUT(putReq({ title: "Cup", entryFeeMinor: 1500.5 }));

      expect(res.status).toBe(400);
      expect(tournamentAdminClient.updateActiveTournament).not.toHaveBeenCalled();
    });

    // spec 0040, FR-14/FR-22: та же full-replace семантика, что contacts —
    // не форвардить program здесь означало бы обнулять программу на сервере
    // при каждом сохранении любого другого поля.
    it("forwards the program field (spec 0040, FR-14)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      await PUT(
        putReq({
          title: "Cup",
          program: [
            {
              date: "2026-12-01",
              items: [{ timeLabel: "9:00", text: "Сбор участников" }],
            },
          ],
        }),
      );

      const reqMsg = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0][0];
      expect(reqMsg.program).toEqual([
        {
          date: "2026-12-01",
          items: [{ timeLabel: "9:00", text: "Сбор участников" }],
        },
      ]);
    });

    it("defaults program to an empty array when absent", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      await PUT(putReq({ title: "Cup" }));

      const reqMsg = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0][0];
      expect(reqMsg.program).toEqual([]);
    });

    // spec 0042 (T40): переключатели уведомлений сохраняются той же
    // full-replace семантикой, что contacts/program (FR-19).
    it("forwards notifications (spec 0042, FR-19)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      await PUT(
        putReq({
          title: "Cup",
          notifications: { applicationState: true, poolSeated: false },
        }),
      );

      const reqMsg = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0][0];
      expect(reqMsg.notifications).toEqual({ applicationState: true, poolSeated: false });
    });

    it("defaults notifications to both false when absent", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("tok");
      vi.mocked(tournamentAdminClient.updateActiveTournament).mockResolvedValue({
        tournament: { id: "t1" },
      } as never);
      vi.mocked(tournamentToJson).mockReturnValue({ id: "t1" } as never);

      await PUT(putReq({ title: "Cup" }));

      const reqMsg = vi.mocked(tournamentAdminClient.updateActiveTournament)
        .mock.calls[0][0];
      expect(reqMsg.notifications).toEqual({ applicationState: false, poolSeated: false });
    });
  });
});
