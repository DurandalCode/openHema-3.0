import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSlotRequest,
  getBracketRequest,
  resetBracketRequest,
  seedSlotRequest,
  setStatusRequest,
  undoBracketRequest,
} from "./requests";
import { UnauthorizedError } from "@/shared/api/unauthorized";

describe("features/bracket-seeding/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getBracketRequest", () => {
    it("GETs /api/stages/[stageId]/bracket and returns ok:true with bracket", async () => {
      const bracket = { rounds: [], unassigned: [], canUndo: false };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ bracket }) });

      const result = await getBracketRequest("s1");

      expect(result).toEqual({ ok: true, bracket });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/bracket", { method: "GET" });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not found" }) });
      const result = await getBracketRequest("s1");
      expect(result).toEqual({ ok: false, error: "not found" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await getBracketRequest("s1");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });
      await expect(getBracketRequest("s1")).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("seedSlotRequest", () => {
    it("POSTs /api/stages/[stageId]/seed with fighterId + slot", async () => {
      const bracket = { rounds: [], unassigned: [], canUndo: true };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ bracket }) });

      const result = await seedSlotRequest("s1", "f1", 3);

      expect(result).toEqual({ ok: true, bracket });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighterId: "f1", slot: 3 }),
      });
    });

    it("returns ok:false when the target slot is occupied (ErrSlotOccupied)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "slot is already occupied" }),
      });
      const result = await seedSlotRequest("s1", "f1", 3);
      expect(result).toEqual({ ok: false, error: "slot is already occupied" });
    });
  });

  describe("clearSlotRequest", () => {
    it("DELETEs /api/stages/[stageId]/seed with slot in the body", async () => {
      const bracket = { rounds: [], unassigned: [], canUndo: true };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ bracket }) });

      const result = await clearSlotRequest("s1", 3);

      expect(result).toEqual({ ok: true, bracket });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/seed", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: 3 }),
      });
    });
  });

  describe("resetBracketRequest", () => {
    it("POSTs /api/stages/[stageId]/reset", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: {} }) });
      const result = await resetBracketRequest("s1");
      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/reset", { method: "POST" });
    });
  });

  describe("undoBracketRequest", () => {
    it("POSTs /api/stages/[stageId]/undo", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: {} }) });
      const result = await undoBracketRequest("s1");
      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/undo", { method: "POST" });
    });
  });

  describe("setStatusRequest", () => {
    it("POSTs /api/stages/[stageId]/status with status", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: {} }) });
      const result = await setStatusRequest("s1", "ready");
      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
    });

    it("returns ok:false when fewer than two fighters are seeded (ErrNotEnoughSeeds)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "not enough seeded fighters to lock the bracket" }),
      });
      const result = await setStatusRequest("s1", "ready");
      expect(result).toEqual({
        ok: false,
        error: "not enough seeded fighters to lock the bracket",
      });
    });
  });

  /**
   * HTTP-статус — единственный вход `bracketErrorMessage` (она свитчится по
   * нему, а не по тексту ошибки от Go-домена). Пока фетчеры его роняли, все
   * переводы были недостижимы и любой отказ показывался generic-текстом
   * «Не удалось выполнить действие» — включая 404 после сброса посева, по
   * которому баг с турнира и не удалось прочитать с экрана.
   */
  describe("HTTP status propagation", () => {
    it("carries the status of a failed bracket read", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "stage not found" }) });
      const result = await getBracketRequest("s1");
      expect(result).toEqual({ ok: false, error: "stage not found", status: 404 });
    });

    it("carries the status of a rejected seed", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "slot is already occupied" }) });
      const result = await seedSlotRequest("s1", "f1", 2);
      expect(result).toEqual({ ok: false, error: "slot is already occupied", status: 409 });
    });

    it("carries the status of a rejected clear", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "layout is ready" }) });
      const result = await clearSlotRequest("s1", 2);
      expect(result).toEqual({ ok: false, error: "layout is ready", status: 409 });
    });

    it.each([
      ["reset", () => resetBracketRequest("s1")],
      ["undo", () => undoBracketRequest("s1")],
      ["status", () => setStatusRequest("s1", "ready")],
    ])("carries the status of a rejected %s action", async (_name, call) => {
      fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "layout is ready" }) });
      await expect(call()).resolves.toEqual({ ok: false, error: "layout is ready", status: 409 });
    });
  });
});
