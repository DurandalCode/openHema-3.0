import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStageRequest, deleteStageRequest, listStagesRequest } from "./requests";

describe("features/stage-management/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listStagesRequest", () => {
    it("GETs /api/nominations/[id]/stages and returns ok:true with stages", async () => {
      const stages = [
        {
          id: "s1",
          nominationId: "n1",
          position: 0,
          title: "Групповой этап",
          type: "STAGE_TYPE_GROUPS",
          status: "POOL_LAYOUT_STATUS_DRAFT",
          bracket: null,
        },
      ];
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stages }) });

      const result = await listStagesRequest("n1");

      expect(result).toEqual({ ok: true, stages });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/stages", { method: "GET" });
    });

    it("returns empty stages when response omits the field (proto3-omitted)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await listStagesRequest("n1");
      expect(result).toEqual({ ok: true, stages: [] });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "forbidden" }) });
      const result = await listStagesRequest("n1");
      expect(result).toEqual({ ok: false, error: "forbidden" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await listStagesRequest("n1");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("createStageRequest", () => {
    it("POSTs /api/nominations/[id]/stages with bracket payload", async () => {
      const stage = {
        id: "s2",
        nominationId: "n1",
        position: 1,
        title: "Плейофф",
        type: "STAGE_TYPE_BRACKET",
        status: "POOL_LAYOUT_STATUS_DRAFT",
        bracket: { size: 8, thirdPlace: true },
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ stage, stages: [stage] }),
      });

      const result = await createStageRequest("n1", {
        title: "Плейофф",
        bracketSize: 8,
        thirdPlace: true,
      });

      expect(result).toEqual({ ok: true, stage, stages: [stage] });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bracket",
          title: "Плейофф",
          bracketSize: 8,
          thirdPlace: true,
        }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "invalid bracket size" }),
      });
      const result = await createStageRequest("n1", {
        title: "Плейофф",
        bracketSize: 3,
        thirdPlace: false,
      });
      expect(result).toEqual({ ok: false, error: "invalid bracket size" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await createStageRequest("n1", {
        title: "Плейофф",
        bracketSize: 8,
        thirdPlace: false,
      });
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("deleteStageRequest", () => {
    it("DELETEs /api/stages/[stageId] and returns remaining stages", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stages: [] }) });
      const result = await deleteStageRequest("s2");
      expect(result).toEqual({ ok: true, stages: [] });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s2", { method: "DELETE" });
    });

    it("returns ok:false with server error on 4xx (e.g. groups stage / started bouts)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "stage is not deletable" }),
      });
      const result = await deleteStageRequest("s1");
      expect(result).toEqual({ ok: false, error: "stage is not deletable" });
    });
  });
});
