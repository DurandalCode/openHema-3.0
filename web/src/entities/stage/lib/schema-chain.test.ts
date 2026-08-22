import { describe, expect, it } from "vitest";
import { schemaChain } from "./schema-chain";
import type { Stage } from "./types";

function stage(partial: Partial<Stage>): Stage {
  return {
    id: "stage-1",
    nominationId: "n1",
    position: 0,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_READY",
    bracket: null,
    groups: { groupCount: 4 },
    rule: null,
    executionStatus: "STAGE_STATUS_UNSPECIFIED",
    ...partial,
  };
}

describe("schemaChain", () => {
  it("возвращает пустой массив без этапов", () => {
    expect(schemaChain([])).toEqual([]);
  });

  it("сохраняет порядок уровней по position", () => {
    const stages = [
      stage({ id: "s2", position: 1, title: "Плейофф", type: "STAGE_TYPE_BRACKET", bracket: { size: 8, thirdPlace: false }, groups: null, executionStatus: "STAGE_STATUS_DRAFT" }),
      stage({ id: "s1", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_FINISHED" }),
    ];
    const chain = schemaChain(stages);
    expect(chain).toHaveLength(2);
    expect(chain[0].stages.map((s) => s.title)).toEqual(["Групповой этап"]);
    expect(chain[1].stages.map((s) => s.title)).toEqual(["Плейофф"]);
  });

  it("группирует параллельные этапы одного уровня в один элемент", () => {
    const stages = [
      stage({ id: "s1", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_FINISHED" }),
      stage({ id: "s2", position: 1, title: "Полуфинал A", type: "STAGE_TYPE_BRACKET", bracket: { size: 4, thirdPlace: false }, groups: null, executionStatus: "STAGE_STATUS_ACTIVE" }),
      stage({ id: "s3", position: 1, title: "Полуфинал B", type: "STAGE_TYPE_BRACKET", bracket: { size: 4, thirdPlace: false }, groups: null, executionStatus: "STAGE_STATUS_DRAFT" }),
    ];
    const chain = schemaChain(stages);
    expect(chain).toHaveLength(2);
    expect(chain[1].stages.map((s) => s.title)).toEqual(["Полуфинал A", "Полуфинал B"]);
  });

  it("маппит executionStatus в state: finished/running/pending", () => {
    const stages = [
      stage({ id: "s1", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_FINISHED" }),
      stage({ id: "s2", position: 1, title: "Полуфинал", executionStatus: "STAGE_STATUS_ACTIVE" }),
      stage({ id: "s3", position: 2, title: "Финал", executionStatus: "STAGE_STATUS_READY" }),
      stage({ id: "s4", position: 3, title: "Ещё этап", executionStatus: "STAGE_STATUS_DRAFT" }),
    ];
    const chain = schemaChain(stages);
    expect(chain[0].stages[0].state).toBe("finished");
    expect(chain[1].stages[0].state).toBe("running");
    expect(chain[2].stages[0].state).toBe("running");
    expect(chain[3].stages[0].state).toBe("pending");
  });

  it("строит configLabel через stageConfigLabel", () => {
    const stages = [
      stage({ id: "s1", position: 0, title: "Групповой этап", groups: { groupCount: 4 } }),
      stage({ id: "s2", position: 1, title: "Плейофф", type: "STAGE_TYPE_BRACKET", bracket: { size: 8, thirdPlace: true }, groups: null }),
    ];
    const chain = schemaChain(stages);
    expect(chain[0].stages[0].configLabel).toBe("4 гр.");
    expect(chain[1].stages[0].configLabel).toBe("8 · бронза");
  });

  it("waitingHint пуст, если этап не pending", () => {
    const stages = [stage({ id: "s1", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_ACTIVE" })];
    expect(schemaChain(stages)[0].stages[0].waitingHint).toBe("");
  });

  it("waitingHint строит подпись источника-этапа для pending-этапа", () => {
    const stages = [
      stage({ id: "s1", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_FINISHED" }),
      stage({
        id: "s2",
        position: 1,
        title: "Плейофф",
        type: "STAGE_TYPE_BRACKET",
        bracket: { size: 8, thirdPlace: false },
        groups: null,
        executionStatus: "STAGE_STATUS_DRAFT",
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_STAGE",
          sourceStageId: "s1",
          selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
          placeFrom: 1,
          placeTo: 2,
          method: "STAGE_LAYOUT_METHOD_SEEDED",
        },
      }),
    ];
    const chain = schemaChain(stages);
    expect(chain[1].stages[0].waitingHint).toBe("ждёт результаты «Групповой этап»");
  });

  it("waitingHint пуст, если источник — ростер номинации либо правила нет", () => {
    const stages = [
      stage({
        id: "s1",
        position: 0,
        title: "Групповой этап",
        executionStatus: "STAGE_STATUS_DRAFT",
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_ROSTER",
          sourceStageId: "",
          selector: "STAGE_SELECTOR_KIND_ALL",
          placeFrom: 0,
          placeTo: 0,
          method: "STAGE_LAYOUT_METHOD_SNAKE",
        },
      }),
    ];
    expect(schemaChain(stages)[0].stages[0].waitingHint).toBe("");

    const stagesNoRule = [stage({ id: "s2", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_DRAFT", rule: null })];
    expect(schemaChain(stagesNoRule)[0].stages[0].waitingHint).toBe("");
  });

  it("не включает в вывод правила посева и диагностику схемы", () => {
    const stages = [stage({ id: "s1", position: 0, title: "Групповой этап" })];
    const item = schemaChain(stages)[0].stages[0];
    expect(item).toEqual({
      id: "s1",
      title: "Групповой этап",
      configLabel: "4 гр.",
      state: "pending",
      waitingHint: "",
    });
  });
});
