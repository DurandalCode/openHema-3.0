/**
 * Человекочитаемые подписи типа этапа (RU, спека 0018, FR-1/FR-2). Статус
 * этапа переиспользует `poolLayoutStatusLabel` (`entities/pool/lib/types.ts`)
 * — `Stage.status` той же формы (`PoolLayoutStatus`), отдельной подписи не
 * заводим.
 */

import type { SeedingRule, Stage, StageType } from "./types";

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

/**
 * placeRangeLabel — подпись границ окна отбора (спека 0019, FR-3): закрытая
 * граница — «1–2» (или «3», если совпадают), открытая верхняя (`placeTo = 0`)
 * — «3 и ниже» (FR-3).
 */
function placeRangeLabel(rule: SeedingRule): string {
  if (rule.placeTo === 0) return `${rule.placeFrom} и ниже`;
  if (rule.placeFrom === rule.placeTo) return `${rule.placeFrom}`;
  return `${rule.placeFrom}–${rule.placeTo}`;
}

/** selectorLabel — подпись селектора правила (спека 0019, FR-3). */
function selectorLabel(rule: SeedingRule): string {
  switch (rule.selector) {
    case "STAGE_SELECTOR_KIND_ALL":
      return "Все участники";
    case "STAGE_SELECTOR_KIND_GROUP_PLACES":
      return `Места ${placeRangeLabel(rule)} каждой группы`;
    case "STAGE_SELECTOR_KIND_OVERALL_PLACES":
      return `Места ${placeRangeLabel(rule)} сводного порядка`;
    default:
      return "—";
  }
}

/**
 * sourceLabel — подпись источника правила (спека 0019, FR-2): «Ростер
 * номинации» для источника-ростера, иначе название этапа-источника из
 * переданного списка (клиент не хранит собственную копию схемы, только
 * то, что ему передали).
 */
function sourceLabel(rule: SeedingRule, stages: Pick<Stage, "id" | "title">[]): string {
  if (rule.sourceKind === "STAGE_SOURCE_KIND_ROSTER") return "Ростер номинации";
  if (rule.sourceKind === "STAGE_SOURCE_KIND_STAGE") {
    return stages.find((s) => s.id === rule.sourceStageId)?.title || "—";
  }
  return "—";
}

/**
 * stageRuleLabel — человекочитаемая подпись правила отбора этапа целиком
 * (спека 0019, FR-1..FR-3), например «Места 1–2 каждой группы · Групповой
 * этап». Используется диалогами создания/правки правила (features) и схемой
 * номинации (`widgets/nomination-schema`). `null` — правила нет (FR-1): этап
 * набирается руками.
 */
export function stageRuleLabel(rule: SeedingRule | null, stages: Pick<Stage, "id" | "title">[]): string {
  if (!rule) return "Правила нет — набирается руками";
  return `${selectorLabel(rule)} · ${sourceLabel(rule, stages)}`;
}

/**
 * groupStagesByLevel — группировка этапов номинации по уровням схемы
 * (спека 0019, FR-10/FR-25): один уровень — одна `position`, параллельные
 * ветки от общего источника делят уровень (FR-10). Уровни отсортированы по
 * возрастанию позиции, этапы внутри уровня — по названию (детерминированный
 * порядок отображения для одновременных веток).
 */
export function groupStagesByLevel<T extends Pick<Stage, "position" | "title">>(stages: T[]): T[][] {
  const byPosition = new Map<number, T[]>();
  for (const stage of stages) {
    const level = byPosition.get(stage.position);
    if (level) {
      level.push(stage);
    } else {
      byPosition.set(stage.position, [stage]);
    }
  }
  return [...byPosition.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, level]) => [...level].sort((a, b) => a.title.localeCompare(b.title)));
}
