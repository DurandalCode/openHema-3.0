import { describe, expect, it } from "vitest";
import { nominationPosition } from "./position";
import { emptyNominationLiveSnapshot, type NominationLiveSnapshotDto } from "./types";
import type { Stage } from "@/entities/stage/lib/types";

function stage(partial: Partial<Stage>): Stage {
  return {
    id: "stage-1",
    nominationId: "n1",
    position: 0,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_READY",
    bracket: null,
    groups: null,
    rule: null,
    executionStatus: "STAGE_STATUS_UNSPECIFIED",
    ...partial,
  };
}

function snapshotWithStages(stages: Stage[]): NominationLiveSnapshotDto {
  return { ...emptyNominationLiveSnapshot("n1"), stages };
}

describe("nominationPosition", () => {
  it("возвращает upcoming без единого этапа", () => {
    expect(nominationPosition(snapshotWithStages([]))).toEqual({ phase: "upcoming", stageTitle: "" });
  });

  it("возвращает upcoming, если ни один этап не начат (все draft/ready)", () => {
    const snapshot = snapshotWithStages([
      stage({ id: "s1", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_READY" }),
      stage({ id: "s2", position: 1, title: "Плейофф", executionStatus: "STAGE_STATUS_DRAFT" }),
    ]);
    expect(nominationPosition(snapshot)).toEqual({ phase: "upcoming", stageTitle: "" });
  });

  it("возвращает running с названием идущего этапа", () => {
    const snapshot = snapshotWithStages([
      stage({ id: "s1", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_ACTIVE" }),
      stage({ id: "s2", position: 1, title: "Плейофф", executionStatus: "STAGE_STATUS_DRAFT" }),
    ]);
    expect(nominationPosition(snapshot)).toEqual({ phase: "running", stageTitle: "Групповой этап" });
  });

  it("при нескольких активных этапах берёт с наименьшей position", () => {
    const snapshot = snapshotWithStages([
      stage({ id: "s2", position: 1, title: "Полуфинал A", executionStatus: "STAGE_STATUS_ACTIVE" }),
      stage({ id: "s1", position: 0, title: "Полуфинал B", executionStatus: "STAGE_STATUS_ACTIVE" }),
    ]);
    expect(nominationPosition(snapshot)).toEqual({ phase: "running", stageTitle: "Полуфинал B" });
  });

  it("при равной position тай-брейк по title", () => {
    const snapshot = snapshotWithStages([
      stage({ id: "s2", position: 1, title: "Ветка B", executionStatus: "STAGE_STATUS_ACTIVE" }),
      stage({ id: "s1", position: 1, title: "Ветка A", executionStatus: "STAGE_STATUS_ACTIVE" }),
    ]);
    expect(nominationPosition(snapshot)).toEqual({ phase: "running", stageTitle: "Ветка A" });
  });

  it("возвращает finished, когда все этапы завершены", () => {
    const snapshot = snapshotWithStages([
      stage({ id: "s1", position: 0, title: "Групповой этап", executionStatus: "STAGE_STATUS_FINISHED" }),
      stage({ id: "s2", position: 1, title: "Плейофф", executionStatus: "STAGE_STATUS_FINISHED" }),
    ]);
    expect(nominationPosition(snapshot)).toEqual({ phase: "finished", stageTitle: "" });
  });
});
