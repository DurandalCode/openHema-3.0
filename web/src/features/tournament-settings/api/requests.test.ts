import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getActiveTournamentRequest,
  updateTournamentRequest,
} from "./requests";

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
  });
});