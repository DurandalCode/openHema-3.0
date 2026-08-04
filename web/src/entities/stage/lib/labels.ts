/**
 * Человекочитаемые подписи типа этапа (RU, спека 0018, FR-1/FR-2). Статус
 * этапа переиспользует `poolLayoutStatusLabel` (`entities/pool/lib/types.ts`)
 * — `Stage.status` той же формы (`PoolLayoutStatus`), отдельной подписи не
 * заводим.
 */

import type { StageType } from "./types";

export function stageTypeLabel(type: StageType): string {
  switch (type) {
    case "STAGE_TYPE_GROUPS":
      return "группы";
    case "STAGE_TYPE_BRACKET":
      return "сетка";
    default:
      return "—";
  }
}
