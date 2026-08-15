import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyFormatRequest,
  deleteFormatPresetRequest,
  listFormatPresetsRequest,
  renameFormatPresetRequest,
  saveFormatPresetRequest,
} from "./requests";

describe("features/format-presets/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const preset = {
    id: "p1",
    name: "Группы + двойной плейофф",
    stages: [
      {
        title: "Группы",
        type: "STAGE_TYPE_GROUPS",
        bracket: { size: 0, thirdPlace: false },
        groups: { groupCount: 2 },
        sourceKind: "STAGE_SOURCE_KIND_UNSPECIFIED",
        sourceIndex: -1,
        selector: "STAGE_SELECTOR_KIND_UNSPECIFIED",
        placeFrom: 0,
        placeTo: 0,
        method: "STAGE_LAYOUT_METHOD_UNSPECIFIED",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  describe("listFormatPresetsRequest", () => {
    it("GETs /api/formats and returns ok:true with presets", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ presets: [preset] }) });

      const result = await listFormatPresetsRequest();

      expect(result).toEqual({ ok: true, presets: [preset] });
      expect(fetchMock).toHaveBeenCalledWith("/api/formats", { method: "GET" });
    });

    it("returns empty presets when response omits the field (proto3-omitted)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await listFormatPresetsRequest();
      expect(result).toEqual({ ok: true, presets: [] });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "forbidden" }) });
      const result = await listFormatPresetsRequest();
      expect(result).toEqual({ ok: false, error: "forbidden" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await listFormatPresetsRequest();
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("saveFormatPresetRequest", () => {
    it("POSTs /api/formats with {name, nominationId} and returns the created preset", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ preset }) });

      const result = await saveFormatPresetRequest("Группы + двойной плейофф", "n1");

      expect(result).toEqual({ ok: true, preset });
      expect(fetchMock).toHaveBeenCalledWith("/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Группы + двойной плейофф", nominationId: "n1" }),
      });
    });

    it("returns ok:false with the server's 409 error when the name is taken (AC-17)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "preset name is already taken" }),
      });
      const result = await saveFormatPresetRequest("Дубль", "n1");
      expect(result).toEqual({ ok: false, error: "preset name is already taken", status: 409 });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await saveFormatPresetRequest("x", "n1");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("renameFormatPresetRequest", () => {
    it("PATCHes /api/formats/[presetId] with {name} and returns the updated preset", async () => {
      const renamed = { ...preset, name: "Новое имя" };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ preset: renamed }) });

      const result = await renameFormatPresetRequest("p1", "Новое имя");

      expect(result).toEqual({ ok: true, preset: renamed });
      expect(fetchMock).toHaveBeenCalledWith("/api/formats/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Новое имя" }),
      });
    });

    it("returns ok:false with server error and status on 4xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "preset name is already taken" }),
      });
      const result = await renameFormatPresetRequest("p1", "Дубль");
      expect(result).toEqual({ ok: false, error: "preset name is already taken", status: 409 });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await renameFormatPresetRequest("p1", "x");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("deleteFormatPresetRequest", () => {
    it("DELETEs /api/formats/[presetId] and returns ok:true", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await deleteFormatPresetRequest("p1");
      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/formats/p1", { method: "DELETE" });
    });

    it("returns ok:false with server error and status on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "not found" }) });
      const result = await deleteFormatPresetRequest("p1");
      expect(result).toEqual({ ok: false, error: "not found", status: 404 });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await deleteFormatPresetRequest("p1");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("applyFormatRequest", () => {
    const stages = [
      {
        id: "s1",
        nominationId: "n1",
        position: 0,
        title: "Группы",
        type: "STAGE_TYPE_GROUPS",
        status: "POOL_LAYOUT_STATUS_DRAFT",
        bracket: null,
        groups: { groupCount: 2 },
        rule: null,
      },
    ];

    it("POSTs /api/nominations/[id]/format with {presetId} and returns the new stages", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stages }) });

      const result = await applyFormatRequest("n1", { presetId: "p1" });

      expect(result).toEqual({ ok: true, stages });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId: "p1" }),
      });
    });

    it("POSTs with {sourceNominationId} when copying from another nomination", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stages }) });

      const result = await applyFormatRequest("n2", { sourceNominationId: "n1" });

      expect(result).toEqual({ ok: true, stages });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n2/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceNominationId: "n1" }),
      });
    });

    it("returns empty stages when response omits the field (proto3-omitted)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await applyFormatRequest("n1", { presetId: "p1" });
      expect(result).toEqual({ ok: true, stages: [] });
    });

    it("returns ok:false with the server's 409 FailedPrecondition error when schema is not empty", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "schema is not empty: reset stages first" }),
      });
      const result = await applyFormatRequest("n1", { presetId: "p1" });
      expect(result).toEqual({
        ok: false,
        error: "schema is not empty: reset stages first",
        status: 409,
      });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await applyFormatRequest("n1", { presetId: "p1" });
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });
});
