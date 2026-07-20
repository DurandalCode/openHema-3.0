import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBoutsForNominationRequest,
  getPoolsForArenaRequest,
  seatPoolRequest,
  unseatPoolRequest,
} from "./requests";

describe("features/pool-seating/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getPoolsForArenaRequest", () => {
    it("GETs /api/arenas/[id]/pools and returns seated+available", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ seated: { id: "p1" }, available: [{ id: "p2" }] }),
      });

      const result = await getPoolsForArenaRequest("a1");

      expect(result).toEqual({ ok: true, seated: { id: "p1" }, available: [{ id: "p2" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/arenas/a1/pools", { method: "GET" });
    });

    it("defaults seated to null and available to [] when absent", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const result = await getPoolsForArenaRequest("a1");

      expect(result).toEqual({ ok: true, seated: null, available: [] });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "bad" }) });

      const result = await getPoolsForArenaRequest("a1");

      expect(result).toEqual({ ok: false, error: "bad" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await getPoolsForArenaRequest("a1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("seatPoolRequest", () => {
    it("POSTs /api/pools/[poolId]/seat with arenaId body", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: {} }) });

      const result = await seatPoolRequest("p1", "a1");

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/seat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arenaId: "a1" }),
      });
    });

    it("returns ok:false with server error on 4xx (e.g. arena busy)", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "arena busy" }) });

      const result = await seatPoolRequest("p1", "a1");

      expect(result).toEqual({ ok: false, error: "arena busy" });
    });
  });

  describe("unseatPoolRequest", () => {
    it("POSTs /api/pools/[poolId]/unseat", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: {} }) });

      const result = await unseatPoolRequest("p1");

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/unseat", { method: "POST" });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not seated" }) });

      const result = await unseatPoolRequest("p1");

      expect(result).toEqual({ ok: false, error: "not seated" });
    });
  });

  describe("getBoutsForNominationRequest", () => {
    it("GETs /api/nominations/[id]/bouts and returns bouts", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ bouts: [{ id: "b1", poolId: "p1" }] }),
      });

      const result = await getBoutsForNominationRequest("n1");

      expect(result).toEqual({ ok: true, bouts: [{ id: "b1", poolId: "p1" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/bouts", { method: "GET" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await getBoutsForNominationRequest("n1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });
});
