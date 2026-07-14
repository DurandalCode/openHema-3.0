import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNominationRequest,
  deleteNominationRequest,
  getPoolLayoutStatusRequest,
  listNominationsRequest,
  reorderNominationsRequest,
  updateNominationRequest,
} from "./requests";

describe("features/nomination-management/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listNominationsRequest", () => {
    it("returns ok:true with nominations on 2xx", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ nominations: [{ id: "n1", title: "A" }] }),
      });

      const result = await listNominationsRequest("t1");

      expect(result).toEqual({ ok: true, nominations: [{ id: "n1", title: "A" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations?tournamentId=t1", {
        method: "GET",
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "bad" }) });

      const result = await listNominationsRequest("t1");

      expect(result).toEqual({ ok: false, error: "bad" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await listNominationsRequest("t1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("createNominationRequest", () => {
    it("POSTs /api/nominations with tournamentId + input", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ nomination: { id: "n1", title: "New" } }),
      });

      const result = await createNominationRequest("t1", {
        title: "New",
        description: "Desc",
        fighterCapacity: 16,
        metadata: { rulesUrl: "https://x.test" },
      });

      expect(result).toEqual({ ok: true, nomination: { id: "n1", title: "New" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: "t1",
          title: "New",
          description: "Desc",
          fighterCapacity: 16,
          metadata: { rulesUrl: "https://x.test" },
        }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "title is required" }) });

      const result = await createNominationRequest("t1", { title: "" });

      expect(result).toEqual({ ok: false, error: "title is required" });
    });
  });

  describe("updateNominationRequest", () => {
    it("PUTs /api/nominations/[id] with input", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ nomination: { id: "n1", title: "Updated" } }),
      });

      const result = await updateNominationRequest("n1", { title: "Updated" });

      expect(result).toEqual({ ok: true, nomination: { id: "n1", title: "Updated" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await updateNominationRequest("n1", { title: "X" });

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("deleteNominationRequest", () => {
    it("DELETEs /api/nominations/[id]", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

      const result = await deleteNominationRequest("n1");

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1", { method: "DELETE" });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not found" }) });

      const result = await deleteNominationRequest("n1");

      expect(result).toEqual({ ok: false, error: "not found" });
    });
  });

  describe("getPoolLayoutStatusRequest", () => {
    it("GETs /api/nominations/[id]/pool-status and returns status slice on 2xx", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ status: "POOL_LAYOUT_STATUS_READY", canUndo: true }),
      });

      const result = await getPoolLayoutStatusRequest("n1");

      expect(result).toEqual({
        ok: true,
        status: { status: "POOL_LAYOUT_STATUS_READY", canUndo: true },
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pool-status", {
        method: "GET",
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "forbidden" }) });

      const result = await getPoolLayoutStatusRequest("n1");

      expect(result).toEqual({ ok: false, error: "forbidden" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await getPoolLayoutStatusRequest("n1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("reorderNominationsRequest", () => {
    it("POSTs /api/nominations/reorder with tournamentId + orderedIds", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ nominations: [{ id: "b" }, { id: "a" }] }),
      });

      const result = await reorderNominationsRequest("t1", ["b", "a"]);

      expect(result).toEqual({ ok: true, nominations: [{ id: "b" }, { id: "a" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", orderedIds: ["b", "a"] }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "bad" }) });

      const result = await reorderNominationsRequest("t1", ["a"]);

      expect(result).toEqual({ ok: false, error: "bad" });
    });
  });
});
