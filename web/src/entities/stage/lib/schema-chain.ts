/**
 * schemaChain — публичная цепочка схемы номинации (спека 0035,
 * FR-5/FR-6/FR-7/FR-9): один элемент цепочки на уровень (`groupStagesByLevel`
 * — параллельные этапы одного уровня идут рядом, FR-9), внутри — только то,
 * что видит зритель: название, краткая конфигурация (`stageConfigLabel`),
 * состояние (`finished`/`running`/`pending`) и, для ещё не сформированного
 * этапа, подпись ожидания источника. Правила посева и диагностика схемы
 * (`SchemaIssue`) сюда сознательно не попадают (FR-7) — это инструменты
 * организатора (`widgets/nomination-schema`), а не зрителя.
 */

import { groupStagesByLevel, stageConfigLabel } from "./labels";
import type { Stage } from "./types";

export type SchemaChainStageState = "finished" | "running" | "pending";

export type SchemaChainStageItem = {
  id: string;
  title: string;
  configLabel: string;
  state: SchemaChainStageState;
  waitingHint: string;
};

export type SchemaChainItem = {
  stages: SchemaChainStageItem[];
};

function stageState(stage: Stage): SchemaChainStageState {
  switch (stage.executionStatus) {
    case "STAGE_STATUS_FINISHED":
      return "finished";
    case "STAGE_STATUS_ACTIVE":
    case "STAGE_STATUS_READY":
      return "running";
    default:
      return "pending";
  }
}

/**
 * waitingHint — «ждёт результаты «<источник>»» только для этапа, ожидающего
 * результатов другого этапа схемы (не ростера — тот не «предыдущий этап» в
 * смысле FR-6, и не отсутствие правила вовсе). Источник ищется в том же
 * списке `stages`, что получен целиком (тот же приём, что приватный
 * `sourceStageTitle` в `widgets/nomination-schema/nomination-schema.tsx`).
 */
function waitingHint(stage: Stage, stages: Stage[]): string {
  if (stageState(stage) !== "pending") return "";
  if (!stage.rule || stage.rule.sourceKind !== "STAGE_SOURCE_KIND_STAGE") return "";
  const source = stages.find((s) => s.id === stage.rule?.sourceStageId);
  if (!source) return "";
  return `ждёт результаты «${source.title}»`;
}

export function schemaChain(stages: Stage[]): SchemaChainItem[] {
  return groupStagesByLevel(stages).map((level) => ({
    stages: level.map((stage) => ({
      id: stage.id,
      title: stage.title,
      configLabel: stageConfigLabel(stage),
      state: stageState(stage),
      waitingHint: waitingHint(stage, stages),
    })),
  }));
}
