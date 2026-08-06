import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildStageRequest, previewStageBuildRequest } from "./requests";

describe("features/stage-build/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("previewStageBuildRequest", () => {
    it("POSTs /api/stages/[stageId]/build/preview with ties and returns ok:true with preview", async () => {
      const preview = {
        entries: [],
        unselected: [],
        capacity: 8,
        ties: [],
        overlaps: [],
        sourceUnfinishedBouts: 0,
      };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ preview }) });

      const result = await previewStageBuildRequest("s1", []);

      expect(result).toEqual({ ok: true, preview });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/build/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ties: [] }),
      });
    });

    it("sends resolved ties on a follow-up call (FR-22)", async () => {
      const ties = [{ sourcePoolId: "p1", place: 2, fighterIds: ["f1", "f2"] }];
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          preview: { entries: [], unselected: [], capacity: 8, ties: [], overlaps: [], sourceUnfinishedBouts: 0 },
        }),
      });

      await previewStageBuildRequest("s1", ties);

      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/build/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ties }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "stage not found" }) });
      const result = await previewStageBuildRequest("s1", []);
      expect(result).toEqual({ ok: false, error: "stage not found" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await previewStageBuildRequest("s1", []);
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("buildStageRequest", () => {
    it("POSTs /api/stages/[stageId]/build with ties and returns layout when target is groups", async () => {
      const layout = { nominationId: "n1", status: "POOL_LAYOUT_STATUS_DRAFT", unassigned: [], pools: [], canUndo: true };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout, bracket: null }) });

      const result = await buildStageRequest("s1", []);

      expect(result).toEqual({ ok: true, layout, bracket: null });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ties: [] }),
      });
    });

    it("returns bracket when target is a bracket stage", async () => {
      const bracket = { rounds: [], unassigned: [], canUndo: true };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ layout: null, bracket }) });

      const result = await buildStageRequest("s1", []);

      expect(result).toEqual({ ok: true, layout: null, bracket });
    });

    it("defaults missing layout/bracket fields to null (proto3-omitted)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await buildStageRequest("s1", []);
      expect(result).toEqual({ ok: true, layout: null, bracket: null });
    });

    it("returns ok:false when composition is not empty (ErrStageNotEmpty, FR-18)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "stage composition is not empty" }),
      });
      const result = await buildStageRequest("s1", []);
      expect(result).toEqual({ ok: false, error: "stage composition is not empty" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await buildStageRequest("s1", []);
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });
});
