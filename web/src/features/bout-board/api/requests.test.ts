import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  finishBoutRequest,
  getBoutBoardRequest,
  reopenBoutRequest,
  resetBoutRequest,
  scoreBoutRequest,
  setCurrentBoutRequest,
  startBoutRequest,
} from "./requests";

describe("features/bout-board/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getBoutBoardRequest", () => {
    it("GETs /api/arenas/[id]/board and returns the board", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" } }),
      });

      const result = await getBoutBoardRequest("a1");

      expect(result).toEqual({
        ok: true,
        board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" },
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/arenas/a1/board", { method: "GET" });
    });

    it("defaults board to null when absent", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const result = await getBoutBoardRequest("a1");

      expect(result).toEqual({ ok: true, board: null });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "bad" }) });

      const result = await getBoutBoardRequest("a1");

      expect(result).toEqual({ ok: false, error: "bad" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await getBoutBoardRequest("a1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("setCurrentBoutRequest", () => {
    it("PUTs /api/pools/[poolId]/current-bout with boutId body", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ board: { pool: null, bouts: [], currentBoutId: "b2" } }),
      });

      const result = await setCurrentBoutRequest("p1", "b2");

      expect(result).toEqual({ ok: true, board: { pool: null, bouts: [], currentBoutId: "b2" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/current-bout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boutId: "b2" }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not in pool" }) });

      const result = await setCurrentBoutRequest("p1", "b2");

      expect(result).toEqual({ ok: false, error: "not in pool" });
    });
  });

  describe("startBoutRequest", () => {
    it("POSTs /api/pools/[poolId]/bout with action=start", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ board: { pool: null, bouts: [], currentBoutId: "b1" } }),
      });

      const result = await startBoutRequest("p1");

      expect(result).toEqual({ ok: true, board: { pool: null, bouts: [], currentBoutId: "b1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/bout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
    });
  });

  describe("scoreBoutRequest", () => {
    it("POSTs /api/pools/[poolId]/bout with action=score and scores", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ board: { pool: null, bouts: [], currentBoutId: "b1" } }),
      });

      const result = await scoreBoutRequest("p1", 5, 3);

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/bout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "score", scoreA: 5, scoreB: 3 }),
      });
    });

    it("returns ok:false with server error (e.g. bout not in progress)", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not in progress" }) });

      const result = await scoreBoutRequest("p1", 5, 3);

      expect(result).toEqual({ ok: false, error: "not in progress" });
    });
  });

  describe("finishBoutRequest", () => {
    it("POSTs /api/pools/[poolId]/bout with action=finish", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ board: { pool: null, bouts: [], currentBoutId: "b2" } }),
      });

      await finishBoutRequest("p1");

      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/bout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish" }),
      });
    });
  });

  describe("reopenBoutRequest", () => {
    it("POSTs /api/pools/[poolId]/bout with action=reopen", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ board: { pool: null, bouts: [], currentBoutId: "b1" } }),
      });

      await reopenBoutRequest("p1");

      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/bout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
    });
  });

  describe("resetBoutRequest", () => {
    it("POSTs /api/pools/[poolId]/bout with action=reset", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ board: { pool: null, bouts: [], currentBoutId: "b1" } }),
      });

      await resetBoutRequest("p1");

      expect(fetchMock).toHaveBeenCalledWith("/api/pools/p1/bout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
    });
  });
});
