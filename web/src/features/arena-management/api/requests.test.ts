import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveArenaRequest,
  createArenaRequest,
  getArenaBoardRequest,
  getArenaRequest,
  listArenasRequest,
  reorderArenasRequest,
  restoreArenaRequest,
  setArenaDefaultDurationRequest,
  updateArenaRequest,
} from "./requests";
import { UnauthorizedError } from "@/shared/api/unauthorized";

describe("features/arena-management/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listArenasRequest", () => {
    it("returns ok:true with arenas on 2xx", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arenas: [{ id: "a1", name: "A" }] }),
      });

      const result = await listArenasRequest("t1");

      expect(result).toEqual({ ok: true, arenas: [{ id: "a1", name: "A" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas?tournamentId=t1", {
        method: "GET",
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "bad" }) });

      const result = await listArenasRequest("t1");

      expect(result).toEqual({ ok: false, error: "bad" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await listArenasRequest("t1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17) instead of returning ok:false", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "authentication required" }),
      });

      await expect(listArenasRequest("t1")).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("getArenaRequest", () => {
    it("GETs /api/admin/arenas/[id] and returns arena", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arena: { id: "a1", name: "A" } }),
      });

      const result = await getArenaRequest("a1");

      expect(result).toEqual({ ok: true, arena: { id: "a1", name: "A" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas/a1", { method: "GET" });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not found" }) });

      const result = await getArenaRequest("a1");

      expect(result).toEqual({ ok: false, error: "not found" });
    });

    it("encodes id", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arena: { id: "a b" } }),
      });
      await getArenaRequest("a b");
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas/a%20b", { method: "GET" });
    });
  });

  describe("createArenaRequest", () => {
    it("POSTs /api/admin/arenas with tournamentId + input", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arena: { id: "a1", name: "New" } }),
      });

      const result = await createArenaRequest("t1", { name: "New", description: "Desc" });

      expect(result).toEqual({ ok: true, arena: { id: "a1", name: "New" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", name: "New", description: "Desc" }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "name is required" }) });

      const result = await createArenaRequest("t1", { name: "" });

      expect(result).toEqual({ ok: false, error: "name is required" });
    });
  });

  describe("updateArenaRequest", () => {
    it("PATCHes /api/admin/arenas/[id] with input", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arena: { id: "a1", name: "Updated" } }),
      });

      const result = await updateArenaRequest("a1", { name: "Updated" });

      expect(result).toEqual({ ok: true, arena: { id: "a1", name: "Updated" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas/a1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await updateArenaRequest("a1", { name: "X" });

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("archiveArenaRequest", () => {
    it("POSTs /api/admin/arenas/[id]/archive", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arena: { id: "a1", status: "ARENA_STATUS_ARCHIVED" } }),
      });

      const result = await archiveArenaRequest("a1");

      expect(result).toEqual({
        ok: true,
        arena: { id: "a1", status: "ARENA_STATUS_ARCHIVED" },
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas/a1/archive", { method: "POST" });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "not found" }) });

      const result = await archiveArenaRequest("a1");

      expect(result).toEqual({ ok: false, error: "not found" });
    });
  });

  describe("restoreArenaRequest", () => {
    it("POSTs /api/admin/arenas/[id]/restore", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arena: { id: "a1", status: "ARENA_STATUS_ACTIVE" } }),
      });

      const result = await restoreArenaRequest("a1");

      expect(result).toEqual({
        ok: true,
        arena: { id: "a1", status: "ARENA_STATUS_ACTIVE" },
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas/a1/restore", { method: "POST" });
    });
  });

  describe("reorderArenasRequest", () => {
    it("POSTs /api/admin/arenas/reorder with tournamentId + orderedIds", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arenas: [{ id: "b" }, { id: "a" }] }),
      });

      const result = await reorderArenasRequest("t1", ["b", "a"]);

      expect(result).toEqual({ ok: true, arenas: [{ id: "b" }, { id: "a" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", orderedIds: ["b", "a"] }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "bad" }) });

      const result = await reorderArenasRequest("t1", ["a"]);

      expect(result).toEqual({ ok: false, error: "bad" });
    });
  });

  describe("getArenaBoardRequest", () => {
    it("GETs /api/arenas/[id]/board and returns the board", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" } }),
      });

      const result = await getArenaBoardRequest("a1");

      expect(result).toEqual({
        ok: true,
        board: { pool: { id: "p1" }, bouts: [], currentBoutId: "b1" },
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/arenas/a1/board", { method: "GET" });
    });

    it("defaults board to null when absent", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const result = await getArenaBoardRequest("a1");

      expect(result).toEqual({ ok: true, board: null });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "unauthenticated" }) });

      const result = await getArenaBoardRequest("a1");

      expect(result).toEqual({ ok: false, error: "unauthenticated" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await getArenaBoardRequest("a1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("setArenaDefaultDurationRequest", () => {
    it("PUTs /api/admin/arenas/[id]/default-duration with seconds", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ arena: { id: "a1", defaultDurationSeconds: 300 } }),
      });

      const result = await setArenaDefaultDurationRequest("a1", 300);

      expect(result).toEqual({ ok: true, arena: { id: "a1", defaultDurationSeconds: 300 } });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/arenas/a1/default-duration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultDurationSeconds: 300 }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "defaultDurationSeconds is required" }),
      });

      const result = await setArenaDefaultDurationRequest("a1", 300);

      expect(result).toEqual({ ok: false, error: "defaultDurationSeconds is required" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await setArenaDefaultDurationRequest("a1", 300);

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });
});