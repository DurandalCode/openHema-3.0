/**
 * nominationPosition — текущее положение номинации из живого снапшота (спека
 * 0035, FR-3/FR-4): не начата / идёт (с названием текущего этапа) /
 * завершена. Выводится из `Stage.executionStatus` — нового поля в контракте
 * не заводим. Несколько параллельных активных этапов (0019) — берём с
 * наименьшей `position`, тай-брейк по `title` (тот же порядок, что
 * `groupStagesByLevel`).
 */

import type { NominationLiveSnapshotDto } from "./types";

export type NominationPositionPhase = "upcoming" | "running" | "finished";

export type NominationPosition = {
  phase: NominationPositionPhase;
  stageTitle: string;
};

export function nominationPosition(snapshot: NominationLiveSnapshotDto): NominationPosition {
  const { stages } = snapshot;
  if (stages.length === 0) {
    return { phase: "upcoming", stageTitle: "" };
  }

  const active = stages.filter((stage) => stage.executionStatus === "STAGE_STATUS_ACTIVE");
  if (active.length > 0) {
    const [current] = [...active].sort(
      (a, b) => a.position - b.position || a.title.localeCompare(b.title),
    );
    return { phase: "running", stageTitle: current.title };
  }

  if (stages.every((stage) => stage.executionStatus === "STAGE_STATUS_FINISHED")) {
    return { phase: "finished", stageTitle: "" };
  }

  return { phase: "upcoming", stageTitle: "" };
}
