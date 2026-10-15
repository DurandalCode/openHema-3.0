import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dequeuePoolRequest,
  enqueuePoolRequest,
  getBoutsForNominationRequest,
  getPoolsForArenaRequest,
  reorderArenaQueueRequest,
  seatNextPoolRequest,
  seatPoolRequest,
  unseatPoolRequest,
} from "./requests";
import { UnauthorizedError } from "@/shared/api/unauthorized";

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
    it("GETs /api/arenas/[id]/pools and returns seated+available+queued", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ seated: { id: "p1" }, available: [{ id: "p2" }], queued: [{ id: "p3" }] }),
      });

      const result = await getPoolsForArenaRequest("a1");

      expect(result).toEqual({
        ok: true,
        seated: { id: "p1" },
        available: [{ id: "p2" }],
        queued: [{ id: "p3" }],
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/arenas/a1/pools", { method: "GET" });
    });

    it("defaults seated to null and available/queued to [] when absent", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const result = await getPoolsForArenaRequest("a1");

      expect(result).toEqual({ ok: true, seated: null, available: [], queued: [] });
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

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });

      await expect(getPoolsForArenaRequest("a1")).rejects.toBeInstanceOf(UnauthorizedError);
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

  // Спека 0063: мутации очереди возвращают то же состояние страницы арены,
  // что и GET пулов арены, — клиент кладёт его в кэш без второго запроса.
  describe("queue mutations (спека 0063)", () => {
    const state = { seated: null, available: [{ id: "p9" }], queued: [{ id: "p1" }, { id: "p2" }] };

    it("enqueuePoolRequest POSTs /api/pools/[poolId]/enqueue with arenaId and returns the arena state", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => state });

      const result = await enqueuePoolRequest("p1", "a1");

      expect(result).toEqual({ ok: true, ...state });
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arenaId: "a1" }),
      });
    });

    it("dequeuePoolRequest POSTs /api/pools/[poolId]/dequeue", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => state });

      const result = await dequeuePoolRequest("p1");

      expect(result).toEqual({ ok: true, ...state });
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/dequeue", { method: "POST" });
    });

    it("reorderArenaQueueRequest PUTs /api/arenas/[id]/queue with the full ordered list", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => state });

      const result = await reorderArenaQueueRequest("a1", ["p2", "p1"]);

      expect(result).toEqual({ ok: true, ...state });
      expect(fetchMock).toHaveBeenCalledWith("/api/arenas/a1/queue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolIds: ["p2", "p1"] }),
      });
    });

    it("seatNextPoolRequest POSTs /api/arenas/[id]/seat-next", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...state, seated: { id: "p1" } }) });

      const result = await seatNextPoolRequest("a1");

      expect(result).toMatchObject({ ok: true, seated: { id: "p1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/arenas/a1/seat-next", { method: "POST" });
    });

    it("surfaces the server error (e.g. stale queue) as ok:false", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "очередь изменилась" }) });

      expect(await reorderArenaQueueRequest("a1", ["p1"])).toEqual({ ok: false, error: "очередь изменилась" });
    });

    it("defaults missing parts of the state", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      expect(await dequeuePoolRequest("p1")).toEqual({ ok: true, seated: null, available: [], queued: [] });
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
