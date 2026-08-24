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
import { UnauthorizedError } from "@/shared/api/unauthorized";

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
    it("GETs /api/stages/[stageId]/layout and returns ok:true with layout", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { nominationId: "n1", pools: [] } }),
      });

      const result = await getLayoutRequest("s1");

      expect(result).toEqual({ ok: true, layout: { nominationId: "n1", pools: [] } });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/layout", {
        method: "GET",
      });
    });

    it("returns ok:false with server error and status on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "bad" }) });
      const result = await getLayoutRequest("s1");
      expect(result).toEqual({ ok: false, error: "bad", status: 403 });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await getLayoutRequest("s1");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });
      await expect(getLayoutRequest("s1")).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("createPoolRequest", () => {
    it("POSTs /api/stages/[stageId]/pools", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await createPoolRequest("s1");
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/pools", { method: "POST" });
    });
  });

  describe("deletePoolRequest", () => {
    it("DELETEs /api/pools/[poolId] (адресуется своим id, не этапом)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await deletePoolRequest("p1");
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1", { method: "DELETE" });
    });
  });

  describe("resetLayoutRequest", () => {
    it("POSTs /api/stages/[stageId]/reset", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await resetLayoutRequest("s1");
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/reset", {
        method: "POST",
      });
    });
  });

  describe("assignFighterRequest", () => {
    it("POSTs /api/stages/[stageId]/assign with fighterId + poolId", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await assignFighterRequest("s1", "f1", "p1");
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighterId: "f1", poolId: "p1" }),
      });
    });
  });

  describe("unassignFighterRequest", () => {
    it("POSTs /api/stages/[stageId]/unassign with fighterId", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: { pools: [] } }) });
      await unassignFighterRequest("s1", "f1");
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighterId: "f1" }),
      });
    });
  });

  describe("autoDistributeRequest", () => {
    it("POSTs /api/stages/[stageId]/distribute", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { pools: [], canUndo: true } }),
      });
      await autoDistributeRequest("s1");
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/distribute", {
        method: "POST",
      });
    });

    it("returns ok:false with status on FailedPrecondition (no pools)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "no pools to distribute into" }),
      });
      const result = await autoDistributeRequest("s1");
      expect(result).toEqual({
        ok: false,
        error: "no pools to distribute into",
        status: 409,
      });
    });
  });

  describe("undoRequest", () => {
    it("POSTs /api/stages/[stageId]/undo", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { pools: [], canUndo: false } }),
      });
      await undoRequest("s1");
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/undo", { method: "POST" });
    });
  });

  describe("setLayoutStatusRequest", () => {
    it("POSTs /api/stages/[stageId]/status with status", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { status: "POOL_LAYOUT_STATUS_READY" } }),
      });
      await setLayoutStatusRequest("s1", "ready");
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
    });
  });

  describe("fetchBouts", () => {
    it("GETs /api/nominations/[id]/bouts and returns ok:true with bouts (не переехало на этап)", async () => {
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
