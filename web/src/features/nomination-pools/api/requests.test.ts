import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assignFighterRequest,
  autoDistributeRequest,
  createPoolRequest,
  deletePoolRequest,
  fetchBouts,
  getLayoutRequest,
  resetLayoutRequest,
  setLayoutStatusRequest,
  undoRequest,
  unassignFighterRequest,
} from "./requests";

describe("features/nomination-pools/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getLayoutRequest", () => {
    it("GETs pool-layout and returns ok:true with layout", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { nominationId: "n1", pools: [] } }),
      });

      const result = await getLayoutRequest("n1");

      expect(result).toEqual({ ok: true, layout: { nominationId: "n1", pools: [] } });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pool-layout", {
        method: "GET",
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "bad" }) });
      const result = await getLayoutRequest("n1");
      expect(result).toEqual({ ok: false, error: "bad" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await getLayoutRequest("n1");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("createPoolRequest", () => {
    it("POSTs pools", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await createPoolRequest("n1");
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pools", { method: "POST" });
    });
  });

  describe("deletePoolRequest", () => {
    it("DELETEs /api/pools/[poolId]", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await deletePoolRequest("p1");
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1", { method: "DELETE" });
    });
  });

  describe("resetLayoutRequest", () => {
    it("POSTs pool-layout/reset", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await resetLayoutRequest("n1");
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pool-layout/reset", {
        method: "POST",
      });
    });
  });

  describe("assignFighterRequest", () => {
    it("POSTs pool-assign with fighterId + poolId", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await assignFighterRequest("n1", "f1", "p1");
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pool-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighterId: "f1", poolId: "p1" }),
      });
    });
  });

  describe("unassignFighterRequest", () => {
    it("POSTs pool-unassign with fighterId", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await unassignFighterRequest("n1", "f1");
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pool-unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighterId: "f1" }),
      });
    });
  });

  describe("autoDistributeRequest", () => {
    it("POSTs pool-distribute", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { pools: [], canUndo: true } }),
      });
      await autoDistributeRequest("n1");
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pool-distribute", {
        method: "POST",
      });
    });

    it("returns ok:false on FailedPrecondition (no pools)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "no pools to distribute into" }),
      });
      const result = await autoDistributeRequest("n1");
      expect(result).toEqual({ ok: false, error: "no pools to distribute into" });
    });
  });

  describe("undoRequest", () => {
    it("POSTs pool-undo", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { pools: [], canUndo: false } }),
      });
      await undoRequest("n1");
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pool-undo", { method: "POST" });
    });
  });

  describe("setLayoutStatusRequest", () => {
    it("POSTs pool-status with status", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { status: "POOL_LAYOUT_STATUS_READY" } }),
      });
      await setLayoutStatusRequest("n1", "ready");
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/pool-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
    });
  });

  describe("fetchBouts", () => {
    it("GETs bouts and returns ok:true with bouts", async () => {
      const bouts = [
        {
          id: "b1",
          poolId: "p1",
          nominationId: "n1",
          roundNumber: 1,
          sequenceNumber: 1,
          fighterA: { fighterId: "f1", name: "A", club: "" },
          fighterB: { fighterId: "f2", name: "B", club: "" },
        },
      ];
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ bouts }) });

      const result = await fetchBouts("n1");

      expect(result).toEqual({ ok: true, bouts });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/bouts", { method: "GET" });
    });

    it("returns empty bouts when response omits the field (proto3-omitted)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await fetchBouts("n1");
      expect(result).toEqual({ ok: true, bouts: [] });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "forbidden" }) });
      const result = await fetchBouts("n1");
      expect(result).toEqual({ ok: false, error: "forbidden" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await fetchBouts("n1");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });
});
