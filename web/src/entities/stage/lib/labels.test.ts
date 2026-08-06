import { describe, expect, it } from "vitest";
import { formatPresetSummary, groupStagesByLevel, stageRuleLabel, stageTypeLabel } from "./labels";
import type { FormatPreset, FormatStageSpec, SeedingRule, Stage } from "./types";

describe("entities/stage/lib/labels stageTypeLabel", () => {
  it("labels a group stage", () => {
    expect(stageTypeLabel("STAGE_TYPE_GROUPS")).toBe("группы");
  });

  it("labels a bracket stage", () => {
    expect(stageTypeLabel("STAGE_TYPE_BRACKET")).toBe("сетка");
  });

  it("falls back to a dash for unspecified type", () => {
    expect(stageTypeLabel("STAGE_TYPE_UNSPECIFIED")).toBe("—");
  });
});

function rule(overrides: Partial<SeedingRule>): SeedingRule {
  return {
    sourceKind: "STAGE_SOURCE_KIND_STAGE",
    sourceStageId: "stage-groups",
    selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
    placeFrom: 1,
    placeTo: 2,
    method: "STAGE_LAYOUT_METHOD_SEEDED",
    ...overrides,
  };
}

const sourceStages: Pick<Stage, "id" | "title">[] = [{ id: "stage-groups", title: "Групповой этап" }];

describe("entities/stage/lib/labels stageRuleLabel", () => {
  it("returns a no-rule message when rule is null", () => {
    expect(stageRuleLabel(null, sourceStages)).toBe("Правила нет — набирается руками");
  });

  it("labels a closed group-places window with a stage source (AC-1)", () => {
    expect(stageRuleLabel(rule({}), sourceStages)).toBe("Места 1–2 каждой группы · Групповой этап");
  });

  it("labels an open upper bound as 'N и ниже' (FR-3)", () => {
    const r = rule({ placeFrom: 3, placeTo: 0 });
    expect(stageRuleLabel(r, sourceStages)).toBe("Места 3 и ниже каждой группы · Групповой этап");
  });

  it("labels a single-place window without a dash", () => {
    const r = rule({ placeFrom: 1, placeTo: 1 });
    expect(stageRuleLabel(r, sourceStages)).toBe("Места 1 каждой группы · Групповой этап");
  });

  it("labels the overall-order selector (AC-5)", () => {
    const r = rule({ selector: "STAGE_SELECTOR_KIND_OVERALL_PLACES", placeFrom: 1, placeTo: 8 });
    expect(stageRuleLabel(r, sourceStages)).toBe("Места 1–8 сводного порядка · Групповой этап");
  });

  it("labels the ALL selector regardless of place bounds", () => {
    const r = rule({ selector: "STAGE_SELECTOR_KIND_ALL", sourceKind: "STAGE_SOURCE_KIND_ROSTER", sourceStageId: "" });
    expect(stageRuleLabel(r, sourceStages)).toBe("Все участники · Ростер номинации");
  });

  it("labels a roster source distinctly from a stage source", () => {
    const r = rule({ sourceKind: "STAGE_SOURCE_KIND_ROSTER", sourceStageId: "" });
    expect(stageRuleLabel(r, sourceStages)).toBe("Места 1–2 каждой группы · Ростер номинации");
  });

  it("falls back to a dash when the source stage isn't found in the given list", () => {
    const r = rule({ sourceStageId: "unknown-stage" });
    expect(stageRuleLabel(r, sourceStages)).toBe("Места 1–2 каждой группы · —");
  });
});

function stage(overrides: Partial<Stage>): Stage {
  return {
    id: "s1",
    nominationId: "n1",
    position: 0,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_READY",
    bracket: null,
    groups: { groupCount: 4 },
    rule: null,
    ...overrides,
  };
}

describe("entities/stage/lib/labels groupStagesByLevel", () => {
  it("keeps a single linear stage on its own level (0018 regression)", () => {
    const levels = groupStagesByLevel([stage({ id: "groups", position: 0 }), stage({ id: "bracket", position: 1, type: "STAGE_TYPE_BRACKET", bracket: { size: 8, thirdPlace: true }, groups: null })]);
    expect(levels).toHaveLength(2);
    expect(levels[0].map((s) => s.id)).toEqual(["groups"]);
    expect(levels[1].map((s) => s.id)).toEqual(["bracket"]);
  });

  it("groups two parallel branches from the same source on one level (AC-2)", () => {
    const levels = groupStagesByLevel([
      stage({ id: "groups", position: 0 }),
      stage({ id: "final-bracket", position: 1, title: "Сетка за 1-е место", type: "STAGE_TYPE_BRACKET", bracket: { size: 8, thirdPlace: true }, groups: null }),
      stage({ id: "consolation-bracket", position: 1, title: "Утешительная сетка", type: "STAGE_TYPE_BRACKET", bracket: { size: 4, thirdPlace: false }, groups: null }),
    ]);
    expect(levels).toHaveLength(2);
    expect(levels[1].map((s) => s.id)).toEqual(["final-bracket", "consolation-bracket"]);
  });

  it("sorts stages within a level by title for a deterministic order", () => {
    const levels = groupStagesByLevel([
      stage({ id: "b", position: 1, title: "Б-этап" }),
      stage({ id: "a", position: 1, title: "А-этап" }),
    ]);
    expect(levels[0].map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("handles asymmetric branches: one continues, the other ends at this level", () => {
    const levels = groupStagesByLevel([
      stage({ id: "groups-1", position: 0, title: "Общий круг" }),
      stage({ id: "strong-groups", position: 1, title: "Сильные — группы" }),
      stage({ id: "weak-groups", position: 1, title: "Слабые — группы" }),
      stage({ id: "strong-bracket", position: 2, title: "Сильные — сетка", type: "STAGE_TYPE_BRACKET", bracket: { size: 8, thirdPlace: true }, groups: null }),
    ]);
    expect(levels).toHaveLength(3);
    expect(levels[1].map((s) => s.id)).toEqual(["strong-groups", "weak-groups"]);
    expect(levels[2].map((s) => s.id)).toEqual(["strong-bracket"]);
  });
});

function formatStageSpec(overrides: Partial<FormatStageSpec>): FormatStageSpec {
  return {
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    bracket: { size: 0, thirdPlace: false },
    groups: { groupCount: 0 },
    sourceKind: "STAGE_SOURCE_KIND_UNSPECIFIED",
    sourceIndex: -1,
    selector: "STAGE_SELECTOR_KIND_UNSPECIFIED",
    placeFrom: 0,
    placeTo: 0,
    method: "STAGE_LAYOUT_METHOD_UNSPECIFIED",
    ...overrides,
  };
}

function formatPreset(stages: FormatStageSpec[]): FormatPreset {
  return {
    id: "preset-1",
    name: "Группы + плейофф",
    stages,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

describe("entities/stage/lib/labels formatPresetSummary", () => {
  it("returns an empty string for an empty schema", () => {
    expect(formatPresetSummary(formatPreset([]))).toBe("");
  });

  it("summarizes a single group stage without a set group count", () => {
    const preset = formatPreset([formatStageSpec({ type: "STAGE_TYPE_GROUPS", groups: { groupCount: 0 } })]);
    expect(formatPresetSummary(preset)).toBe("Группы");
  });

  it("summarizes a schema with groups and two brackets, in stage order (AC-12-style)", () => {
    const preset = formatPreset([
      formatStageSpec({ title: "Групповой этап", type: "STAGE_TYPE_GROUPS", groups: { groupCount: 2 } }),
      formatStageSpec({
        title: "Сетка за 1-е место",
        type: "STAGE_TYPE_BRACKET",
        bracket: { size: 8, thirdPlace: true },
        groups: { groupCount: 0 },
        sourceKind: "STAGE_SOURCE_KIND_STAGE",
        sourceIndex: 0,
        selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
        placeFrom: 1,
        placeTo: 2,
        method: "STAGE_LAYOUT_METHOD_SEEDED",
      }),
      formatStageSpec({
        title: "Утешительная сетка",
        type: "STAGE_TYPE_BRACKET",
        bracket: { size: 8, thirdPlace: false },
        groups: { groupCount: 0 },
        sourceKind: "STAGE_SOURCE_KIND_STAGE",
        sourceIndex: 0,
        selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
        placeFrom: 3,
        placeTo: 0,
        method: "STAGE_LAYOUT_METHOD_SEEDED",
      }),
    ]);
    expect(formatPresetSummary(preset)).toBe("Группы (2) → Сетка (8) → Сетка (8)");
  });
});
