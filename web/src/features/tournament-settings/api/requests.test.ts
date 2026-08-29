import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteTournamentFileRequest,
  getActiveTournamentRequest,
  updateTournamentRequest,
  uploadTournamentFileRequest,
} from "./requests";
import { UnauthorizedError } from "@/shared/api/unauthorized";

describe("features/tournament-settings/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getActiveTournamentRequest", () => {
    it("returns ok:true with tournament on 2xx", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tournament: { id: "t1", title: "Cup" } }),
      });

      const result = await getActiveTournamentRequest();

      expect(result).toEqual({ ok: true, tournament: { id: "t1", title: "Cup" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/tournament", { method: "GET" });
    });

    it("returns ok:false with server error and status on 4xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      });

      const result = await getActiveTournamentRequest();

      expect(result).toEqual({ ok: false, error: "not found", status: 404 });
    });

    it("returns default error when server returns no error field", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      const result = await getActiveTournamentRequest();

      expect(result).toEqual({ ok: false, error: "Ошибка запроса", status: 500 });
    });

    it("returns network error with status 0 when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await getActiveTournamentRequest();

      expect(result).toEqual({ ok: false, error: "Сеть недоступна", status: 0 });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });

      await expect(getActiveTournamentRequest()).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("updateTournamentRequest", () => {
    it("PUTs /api/tournament with JSON body on success", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tournament: { id: "t1", title: "New" } }),
      });

      const result = await updateTournamentRequest({
        title: "New",
        description: "Desc",
        emblemUrl: "https://cdn/x.png",
        eventStartAt: "2026-12-01T10:00:00.000Z",
        eventEndAt: "2026-12-03T18:00:00.000Z",
        contacts: [{ type: "CONTACT_TYPE_TELEGRAM", value: "@org" }],
      });

      expect(result).toEqual({
        ok: true,
        tournament: { id: "t1", title: "New" },
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/tournament", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New",
          description: "Desc",
          emblemUrl: "https://cdn/x.png",
          eventStartAt: "2026-12-01T10:00:00.000Z",
          eventEndAt: "2026-12-03T18:00:00.000Z",
          contacts: [{ type: "CONTACT_TYPE_TELEGRAM", value: "@org" }],
        }),
      });
    });

    it("returns ok:false with server error and status on 4xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "title is required" }),
      });

      const result = await updateTournamentRequest({ title: "" });

      expect(result).toEqual({ ok: false, error: "title is required", status: 400 });
    });

    it("returns network error with status 0 when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await updateTournamentRequest({ title: "X" });

      expect(result).toEqual({ ok: false, error: "Сеть недоступна", status: 0 });
    });

    // spec 0037 (T17): новые поля профиля турнира должны уходить в теле
    // запроса — иначе форма, добавляющая поля в UI, но не в fetcher, молча
    // теряет их при сохранении (UpdateActiveTournament — полная замена, FR-22).
    it("forwards the 6 new profile fields in the request body (spec 0037, FR-18/FR-22)", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tournament: { id: "t1", title: "Cup" } }),
      });

      await updateTournamentRequest({
        title: "Cup",
        chiefJudge: "Иванов И.И.",
        regulationsUrl: "https://cdn/rules.pdf",
        venueName: "Дворец спорта",
        venueAddress: "г. Москва, ул. Спортивная, 1",
        entryFeeMinor: 150000,
        entryFeeCurrency: "RUB",
      });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body as string);
      expect(body.chiefJudge).toBe("Иванов И.И.");
      expect(body.regulationsUrl).toBe("https://cdn/rules.pdf");
      expect(body.venueName).toBe("Дворец спорта");
      expect(body.venueAddress).toBe("г. Москва, ул. Спортивная, 1");
      expect(body.entryFeeMinor).toBe(150000);
      expect(body.entryFeeCurrency).toBe("RUB");
    });

    it("forwards entryFeeMinor: null as-is (unset fee distinct from zero, FR-21)", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tournament: { id: "t1", title: "Cup" } }),
      });

      await updateTournamentRequest({ title: "Cup", entryFeeMinor: null, entryFeeCurrency: "" });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body as string);
      expect(body.entryFeeMinor).toBeNull();
    });

    // spec 0042 (T40): переключатели уведомлений сохраняются вместе со
    // всем профилем, тем же fetcher'ом, что chiefJudge/venueName — своей
    // мутации у них нет.
    it("forwards notifications in the request body (spec 0042, FR-19)", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tournament: { id: "t1", title: "Cup" } }),
      });

      await updateTournamentRequest({
        title: "Cup",
        notifications: { applicationState: true, poolSeated: false },
      });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body as string);
      expect(body.notifications).toEqual({ applicationState: true, poolSeated: false });
    });
  });

  describe("uploadTournamentFileRequest (spec 0042, FR-30/FR-31)", () => {
    it("POSTs multipart/form-data to /api/tournament/files/{kind} on success", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tournament: { id: "t1", regulationsFile: { url: "/api/files/r1" } } }),
      });
      const file = new File(["%PDF"], "rules.pdf", { type: "application/pdf" });

      const result = await uploadTournamentFileRequest("regulations", file);

      expect(result).toEqual({
        ok: true,
        tournament: { id: "t1", regulationsFile: { url: "/api/files/r1" } },
      });
      const call = fetchMock.mock.calls[0];
      expect(call[0]).toBe("/api/tournament/files/regulations");
      expect(call[1].method).toBe("POST");
      const body = call[1].body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get("file")).toBe(file);
      // Content-Type НЕ проставлен явно — браузер сам выставляет boundary
      // для multipart/form-data.
      expect(call[1].headers).toBeUndefined();
    });

    it("returns ok:false with server error and status on 4xx (unsupported type/too large)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "unsupported file type: image/svg+xml" }),
      });

      const result = await uploadTournamentFileRequest(
        "emblem",
        new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
      );

      expect(result).toEqual({
        ok: false,
        error: "unsupported file type: image/svg+xml",
        status: 400,
      });
    });
  });

  describe("deleteTournamentFileRequest (spec 0042, FR-36)", () => {
    it("DELETEs /api/tournament/files/{kind} on success", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ tournament: { id: "t1", emblemFile: { url: "" } } }),
      });

      const result = await deleteTournamentFileRequest("emblem");

      expect(result).toEqual({ ok: true, tournament: { id: "t1", emblemFile: { url: "" } } });
      expect(fetchMock).toHaveBeenCalledWith("/api/tournament/files/emblem", { method: "DELETE" });
    });

    it("returns ok:false with server error and status on failure", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "forbidden" }),
      });

      const result = await deleteTournamentFileRequest("regulations");

      expect(result).toEqual({ ok: false, error: "forbidden", status: 403 });
    });
  });
});