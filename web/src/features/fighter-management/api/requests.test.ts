import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addToNominationRequest,
  createFighterRequest,
  editFighterRequest,
  findFighterByAccountRequest,
  importFightersRequest,
  listRosterRequest,
  mergeFightersRequest,
  moveFighterRequest,
  removeFromNominationRequest,
  returnFighterRequest,
  rosterExportUrl,
  withdrawFighterRequest,
} from "./requests";
import { UnauthorizedError } from "@/shared/api/unauthorized";

describe("features/fighter-management/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listRosterRequest", () => {
    it("GETs the roster page for tournamentId/page/pageSize with no filters set", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ fighters: [{ id: "f1" }], totalCount: 1, statusCounts: { active: 1, withdrawn: 0 } }),
      });
      const result = await listRosterRequest("t1", { page: 1, pageSize: 20 });
      expect(result).toEqual({
        ok: true,
        fighters: [{ id: "f1" }],
        totalCount: 1,
        statusCounts: { active: 1, withdrawn: 0 },
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init).toEqual({ method: "GET" });
      const params = new URL(url, "http://localhost").searchParams;
      expect(params.get("tournamentId")).toBe("t1");
      expect(params.get("page")).toBe("1");
      expect(params.get("pageSize")).toBe("20");
      expect(params.getAll("statuses")).toEqual([]);
    });

    it("sends the combined filter (statuses/nominationIds/clubs/includeNoClub/search) as query params", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ fighters: [], totalCount: 0, statusCounts: { active: 0, withdrawn: 0 } }),
      });
      await listRosterRequest("t1", {
        statuses: ["FIGHTER_STATUS_ACTIVE", "FIGHTER_STATUS_WITHDRAWN"],
        nominationIds: ["n1"],
        clubs: ["Клинок Севера"],
        includeNoClub: true,
        search: "иван",
        page: 2,
        pageSize: 50,
      });
      const [url] = fetchMock.mock.calls[0] as [string];
      const params = new URL(url, "http://localhost").searchParams;
      expect(params.getAll("statuses")).toEqual(["FIGHTER_STATUS_ACTIVE", "FIGHTER_STATUS_WITHDRAWN"]);
      expect(params.getAll("nominationIds")).toEqual(["n1"]);
      expect(params.getAll("clubs")).toEqual(["Клинок Севера"]);
      expect(params.get("includeNoClub")).toBe("1");
      expect(params.get("search")).toBe("иван");
      expect(params.get("page")).toBe("2");
      expect(params.get("pageSize")).toBe("50");
    });

    it("defaults totalCount/statusCounts when the response omits them", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighters: [{ id: "f1" }] }) });
      const result = await listRosterRequest("t1", { page: 1, pageSize: 20 });
      expect(result).toEqual({
        ok: true,
        fighters: [{ id: "f1" }],
        totalCount: 0,
        statusCounts: { active: 0, withdrawn: 0 },
      });
    });

    it("returns ok:false on non-ok response", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });
      const result = await listRosterRequest("t1", { page: 1, pageSize: 20 });
      expect(result).toEqual({ ok: false, error: "boom" });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });
      await expect(listRosterRequest("t1", { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("returns ok:false on network failure", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const result = await listRosterRequest("t1", { page: 1, pageSize: 20 });
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("rosterExportUrl", () => {
    it("builds the export URL with the filter, without page/pageSize (spec 0041, FR-14)", () => {
      const url = rosterExportUrl("t1", {
        statuses: ["FIGHTER_STATUS_ACTIVE"],
        clubs: ["Клинок Севера"],
        includeNoClub: true,
        search: "иван",
      });
      const params = new URL(url, "http://localhost").searchParams;
      expect(new URL(url, "http://localhost").pathname).toBe("/api/admin/fighters/export");
      expect(params.get("tournamentId")).toBe("t1");
      expect(params.getAll("statuses")).toEqual(["FIGHTER_STATUS_ACTIVE"]);
      expect(params.getAll("clubs")).toEqual(["Клинок Севера"]);
      expect(params.get("includeNoClub")).toBe("1");
      expect(params.get("search")).toBe("иван");
      expect(params.has("page")).toBe(false);
      expect(params.has("pageSize")).toBe(false);
    });

    it("omits empty dimensions", () => {
      const url = rosterExportUrl("t1", {});
      const params = new URL(url, "http://localhost").searchParams;
      expect(params.getAll("statuses")).toEqual([]);
      expect(params.has("includeNoClub")).toBe(false);
      expect(params.has("search")).toBe(false);
    });
  });

  describe("createFighterRequest", () => {
    it("POSTs create payload", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f1" } }) });
      const result = await createFighterRequest({ tournamentId: "t1", name: "Ivan" });
      expect(result).toEqual({ ok: true, fighter: { id: "f1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/fighters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", name: "Ivan" }),
      });
    });
  });

  describe("editFighterRequest", () => {
    it("PATCHes name/club", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f1" } }) });
      const result = await editFighterRequest("f1", "Ivan Petrov", "Club Y");
      expect(result).toEqual({ ok: true, fighter: { id: "f1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/fighters/f1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ivan Petrov", club: "Club Y" }),
      });
    });
  });

  describe("withdrawFighterRequest", () => {
    it("POSTs reason", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f1" } }) });
      const result = await withdrawFighterRequest("f1", "WITHDRAWAL_REASON_INJURY");
      expect(result).toEqual({ ok: true, fighter: { id: "f1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/fighters/f1/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "WITHDRAWAL_REASON_INJURY" }),
      });
    });
  });

  describe("returnFighterRequest", () => {
    it("POSTs without body", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f1" } }) });
      const result = await returnFighterRequest("f1");
      expect(result).toEqual({ ok: true, fighter: { id: "f1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/fighters/f1/return", { method: "POST" });
    });
  });

  describe("addToNominationRequest", () => {
    it("POSTs nominationId", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f1" } }) });
      const result = await addToNominationRequest("f1", "n1");
      expect(result).toEqual({ ok: true, fighter: { id: "f1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/fighters/f1/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominationId: "n1" }),
      });
    });
  });

  describe("removeFromNominationRequest", () => {
    it("DELETEs with nominationId query", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f1" } }) });
      const result = await removeFromNominationRequest("f1", "n1");
      expect(result).toEqual({ ok: true, fighter: { id: "f1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/fighters/f1/nominations?nominationId=n1", {
        method: "DELETE",
      });
    });
  });

  describe("moveFighterRequest", () => {
    it("POSTs from/to nomination ids", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f1" } }) });
      const result = await moveFighterRequest("f1", "n1", "n2");
      expect(result).toEqual({ ok: true, fighter: { id: "f1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/fighters/f1/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromNominationId: "n1", toNominationId: "n2" }),
      });
    });
  });

  describe("findFighterByAccountRequest", () => {
    it("GETs by userId (spec 0040, FR-9)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f1" } }) });
      const result = await findFighterByAccountRequest("u1");
      expect(result).toEqual({ ok: true, fighter: { id: "f1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/fighters/find-by-account?userId=u1", {
        method: "GET",
      });
    });

    it("adds tournamentId to the query when provided", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: null }) });
      const result = await findFighterByAccountRequest("u1", "t1");
      expect(result).toEqual({ ok: true, fighter: null });
      expect(fetchMock).toHaveBeenCalledWith("/api/fighters/find-by-account?userId=u1&tournamentId=t1", {
        method: "GET",
      });
    });

    it("returns ok:false on non-ok response", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });
      const result = await findFighterByAccountRequest("u1");
      expect(result).toEqual({ ok: false, error: "boom" });
    });
  });

  describe("mergeFightersRequest", () => {
    it("POSTs sourceFighterId/targetFighterId (spec 0040, FR-10)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighter: { id: "f2" } }) });
      const result = await mergeFightersRequest("f1", "f2");
      expect(result).toEqual({ ok: true, fighter: { id: "f2" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/fighters/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFighterId: "f1", targetFighterId: "f2" }),
      });
    });

    it("returns ok:false on non-ok response", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "already merged" }) });
      const result = await mergeFightersRequest("f1", "f2");
      expect(result).toEqual({ ok: false, error: "already merged" });
    });
  });

  describe("importFightersRequest (spec 0049, FR-2/FR-5a)", () => {
    const report = {
      dryRun: true,
      summary: { rowsRead: 1, created: 1, updated: 0, skipped: 0, rejected: 0 },
      rows: [],
    };

    function csv(): File {
      return new File(["имя;клуб;номинации\n"], "roster.csv", { type: "text/csv" });
    }

    function sentForm(): FormData {
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/fighters/import");
      expect(init.method).toBe("POST");
      // Content-Type не задаём руками: boundary multipart проставляет сам
      // браузер по FormData — заданный вручную заголовок его срезает.
      expect(init.headers).toBeUndefined();
      expect(init.body).toBeInstanceOf(FormData);
      return init.body as FormData;
    }

    it("POSTs multipart with the file, dryRun and repeated nominationIds", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ report }) });
      const file = csv();

      const result = await importFightersRequest(file, {
        dryRun: true,
        nominationIds: ["n1", "n2"],
      });

      expect(result).toEqual({ ok: true, report });
      const form = sentForm();
      expect(form.get("file")).toBe(file);
      expect(form.get("dryRun")).toBe("true");
      expect(form.getAll("nominationIds")).toEqual(["n1", "n2"]);
    });

    it("sends dryRun='false' for the confirmed import (FR-2)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ report: { ...report, dryRun: false } }) });

      await importFightersRequest(csv(), { dryRun: false });

      expect(sentForm().get("dryRun")).toBe("false");
    });

    it("sends no nominationIds field when no defaults are chosen", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ report }) });

      await importFightersRequest(csv(), { dryRun: true });

      expect(sentForm().getAll("nominationIds")).toEqual([]);
    });

    it("returns ok:false on non-ok response (file-level error, FR-9/AC-10)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "слишком много строк" }),
      });

      const result = await importFightersRequest(csv(), { dryRun: true });

      expect(result).toEqual({ ok: false, error: "слишком много строк" });
    });
  });
});
