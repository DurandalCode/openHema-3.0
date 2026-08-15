/**
 * resolveSchemaDrop — вся семантика перетаскивания на холсте схемы (спека
 * 0031, FR-13..FR-16): компоненты (`widgets/nomination-schema`) только
 * вызывают эту функцию в `onDragEnd` и реагируют на результат — открывают
 * диалог создания либо вызывают мутацию. `target = null` — бросок на пустую
 * зону холста; `target = <stageId>` — бросок на карточку этапа.
 */

export type StageTypeChoice = "groups" | "bracket";

export type SchemaDragSource =
  | { kind: "palette"; item: "roster" | StageTypeChoice }
  | { kind: "stage"; stageId: string };

export type SchemaDropIntent =
  | { kind: "create-stage"; type: StageTypeChoice; sourceStageId?: string }
  | { kind: "set-roster-source"; stageId: string }
  | { kind: "set-stage-source"; stageId: string; sourceStageId: string }
  | { kind: "none" };

export function resolveSchemaDrop(source: SchemaDragSource, target: string | null): SchemaDropIntent {
  if (source.kind === "palette") {
    if (source.item === "roster") {
      return target ? { kind: "set-roster-source", stageId: target } : { kind: "none" };
    }
    return target ? { kind: "create-stage", type: source.item, sourceStageId: target } : { kind: "create-stage", type: source.item };
  }

  if (!target || target === source.stageId) return { kind: "none" };
  return { kind: "set-stage-source", stageId: target, sourceStageId: source.stageId };
}
