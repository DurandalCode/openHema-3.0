import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStageRequest,
  deleteStageRequest,
  listStagesRequest,
  setStageRuleRequest,
  setStageStatusRequest,
  updateStageRequest,
} from "./requests";

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

      expect(result).toEqual({ ok: true, stages, issues: [] });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/stages", { method: "GET" });
    });

    it("returns empty stages/issues when response omits the fields (proto3-omitted)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await listStagesRequest("n1");
      expect(result).toEqual({ ok: true, stages: [], issues: [] });
    });

    it("returns diagnostics when the response carries issues (спека 0020, FR-8)", async () => {
      const issues = [
        {
          severity: "SCHEMA_ISSUE_SEVERITY_WARNING",
          code: "SCHEMA_ISSUE_CODE_COVERAGE_GAP",
          stageIds: ["s1", "s2"],
          message: "Разрыв покрытия по месту 3",
        },
      ];
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stages: [], issues }) });
      const result = await listStagesRequest("n1");
      expect(result).toEqual({ ok: true, stages: [], issues });
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
    it("POSTs /api/nominations/[id]/stages with bracket payload and reads the `created` field", async () => {
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
        json: async () => ({ created: stage, stages: [stage] }),
      });

      const result = await createStageRequest("n1", {
        type: "bracket",
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

    it("POSTs a groups payload with groupCount, no bracket fields (FR-8)", async () => {
      const stage = {
        id: "s3",
        nominationId: "n1",
        position: 1,
        title: "Сильная группа",
        type: "STAGE_TYPE_GROUPS",
        status: "POOL_LAYOUT_STATUS_DRAFT",
        bracket: null,
        groups: { groupCount: 2 },
        rule: null,
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ created: stage, stages: [stage] }),
      });

      const result = await createStageRequest("n1", {
        type: "groups",
        title: "Сильная группа",
        groupCount: 2,
      });

      expect(result).toEqual({ ok: true, stage, stages: [stage] });
      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "groups",
          title: "Сильная группа",
          groupCount: 2,
        }),
      });
    });

    it("includes rule in the body when provided, without a method field (FR-4/FR-6)", async () => {
      const stage = { id: "s4", nominationId: "n1", position: 1, title: "Плейофф 1-е место" };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ created: stage, stages: [] }) });

      await createStageRequest("n1", {
        type: "bracket",
        title: "Плейофф 1-е место",
        bracketSize: 8,
        thirdPlace: false,
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_STAGE",
          sourceStageId: "s1",
          selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
          placeFrom: 1,
          placeTo: 2,
        },
      });

      expect(fetchMock).toHaveBeenCalledWith("/api/nominations/n1/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bracket",
          title: "Плейофф 1-е место",
          bracketSize: 8,
          thirdPlace: false,
          rule: {
            sourceKind: "STAGE_SOURCE_KIND_STAGE",
            sourceStageId: "s1",
            selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
            placeFrom: 1,
            placeTo: 2,
          },
        }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "invalid bracket size" }),
      });
      const result = await createStageRequest("n1", {
        type: "bracket",
        title: "Плейофф",
        bracketSize: 3,
        thirdPlace: false,
      });
      expect(result).toEqual({ ok: false, error: "invalid bracket size" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await createStageRequest("n1", {
        type: "bracket",
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

  describe("setStageRuleRequest", () => {
    it("PUTs /api/stages/[stageId]/rule with the rule and returns the updated stage", async () => {
      const stage = {
        id: "s1",
        nominationId: "n1",
        position: 0,
        title: "Плейофф",
        type: "STAGE_TYPE_BRACKET",
        status: "POOL_LAYOUT_STATUS_DRAFT",
        bracket: { size: 8, thirdPlace: false },
        groups: null,
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_ROSTER",
          sourceStageId: "",
          selector: "STAGE_SELECTOR_KIND_ALL",
          placeFrom: 0,
          placeTo: 0,
          method: "STAGE_LAYOUT_METHOD_SEEDED",
        },
      };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stage }) });

      const result = await setStageRuleRequest("s1", {
        sourceKind: "STAGE_SOURCE_KIND_ROSTER",
        sourceStageId: "",
        selector: "STAGE_SELECTOR_KIND_ALL",
        placeFrom: 0,
        placeTo: 0,
      });

      expect(result).toEqual({ ok: true, stage });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/rule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rule: {
            sourceKind: "STAGE_SOURCE_KIND_ROSTER",
            sourceStageId: "",
            selector: "STAGE_SELECTOR_KIND_ALL",
            placeFrom: 0,
            placeTo: 0,
          },
        }),
      });
    });

    it("PUTs rule: null to clear the rule (AC-16)", async () => {
      const stage = { id: "s1", rule: null };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stage }) });

      const result = await setStageRuleRequest("s1", null);

      expect(result).toEqual({ ok: true, stage });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/rule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule: null }),
      });
    });

    it("returns ok:false when the stage already has a non-empty composition (AC-16)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "stage composition is not empty" }),
      });
      const result = await setStageRuleRequest("s1", null);
      expect(result).toEqual({ ok: false, error: "stage composition is not empty" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await setStageRuleRequest("s1", null);
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("setStageStatusRequest", () => {
    it("POSTs /api/stages/[stageId]/status with 'ready' and returns the new status (спека 0031, FR-22)", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { status: "POOL_LAYOUT_STATUS_READY" } }),
      });

      const result = await setStageStatusRequest("s1", "ready");

      expect(result).toEqual({ ok: true, status: "POOL_LAYOUT_STATUS_READY" });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
    });

    it("POSTs with 'draft' and returns the new status", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ layout: { status: "POOL_LAYOUT_STATUS_DRAFT" } }),
      });

      const result = await setStageStatusRequest("s1", "draft");

      expect(result).toEqual({ ok: true, status: "POOL_LAYOUT_STATUS_DRAFT" });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "not enough seeded fighters" }),
      });
      const result = await setStageStatusRequest("s1", "ready");
      expect(result).toEqual({ ok: false, error: "not enough seeded fighters" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await setStageStatusRequest("s1", "ready");
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("updateStageRequest", () => {
    it("PATCHes /api/stages/[stageId] with title + bracket config and returns the updated stage", async () => {
      const stage = {
        id: "s1",
        nominationId: "n1",
        position: 0,
        title: "Плейофф 2",
        type: "STAGE_TYPE_BRACKET",
        status: "POOL_LAYOUT_STATUS_DRAFT",
        bracket: { size: 8, thirdPlace: true },
        groups: null,
        rule: null,
      };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stage }) });

      const result = await updateStageRequest("s1", {
        title: "Плейофф 2",
        bracket: { size: 8, thirdPlace: true },
      });

      expect(result).toEqual({ ok: true, stage });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Плейофф 2", bracket: { size: 8, thirdPlace: true } }),
      });
    });

    it("PATCHes with title + groups config", async () => {
      const stage = { id: "s2", title: "Группы", groups: { groupCount: 3 } };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stage }) });

      const result = await updateStageRequest("s2", { title: "Группы", groups: { groupCount: 3 } });

      expect(result).toEqual({ ok: true, stage });
      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s2", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Группы", groups: { groupCount: 3 } }),
      });
    });

    it("PATCHes title-only when config is omitted (composeEmpty=false)", async () => {
      const stage = { id: "s1", title: "Новое название" };
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stage }) });

      await updateStageRequest("s1", { title: "Новое название" });

      expect(fetchMock).toHaveBeenCalledWith("/api/stages/s1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Новое название" }),
      });
    });

    it("returns ok:false with server error on 4xx (e.g. ErrStageLocked)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "stage is locked" }),
      });
      const result = await updateStageRequest("s1", { title: "x" });
      expect(result).toEqual({ ok: false, error: "stage is locked" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));
      const result = await updateStageRequest("s1", { title: "x" });
      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });
});
