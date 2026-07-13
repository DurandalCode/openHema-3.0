import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addToNominationRequest,
  createFighterRequest,
  editFighterRequest,
  listRosterRequest,
  moveFighterRequest,
  removeFromNominationRequest,
  returnFighterRequest,
  withdrawFighterRequest,
} from "./requests";

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
    it("GETs roster by tournamentId", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ fighters: [{ id: "f1" }] }) });
      const result = await listRosterRequest("t1");
      expect(result).toEqual({ ok: true, fighters: [{ id: "f1" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/fighters?tournamentId=t1", {
        method: "GET",
      });
    });

    it("returns ok:false on non-ok response", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) });
      const result = await listRosterRequest("t1");
      expect(result).toEqual({ ok: false, error: "boom" });
    });

    it("returns ok:false on network failure", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const result = await listRosterRequest("t1");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
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
});
