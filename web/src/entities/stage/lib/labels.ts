/**
 * Человекочитаемые подписи типа этапа (RU, спека 0018, FR-1/FR-2). Статус
 * этапа переиспользует `poolLayoutStatusLabel` (`entities/pool/lib/types.ts`)
 * — `Stage.status` той же формы (`PoolLayoutStatus`), отдельной подписи не
 * заводим.
 */

import type { FormatPreset, FormatStageSpec, SchemaIssue, SeedingRule, Stage, StageType } from "./types";

/**
 * stageConfigLabel — сводка конфига этапа на карточке схемы (спека 0031,
 * FR-9): «8 · бронза» / «16» для сетки, «4 гр.» для группового этапа с
 * заданным числом групп. Пустая строка — у группового этапа без заданного
 * числа групп (авто-этап, 0019 FR-9) и у этапа без конфига вовсе.
 */
export function stageConfigLabel(stage: Pick<Stage, "type" | "bracket" | "groups">): string {
  if (stage.type === "STAGE_TYPE_BRACKET" && stage.bracket) {
    return stage.bracket.thirdPlace ? `${stage.bracket.size} · бронза` : `${stage.bracket.size}`;
  }
  if (stage.type === "STAGE_TYPE_GROUPS" && stage.groups && stage.groups.groupCount > 0) {
    return `${stage.groups.groupCount} гр.`;
  }
  return "";
}

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

/**
 * stageTypeSummary — общая форма «тип + ключевой параметр» («Группы (2)»,
 * «Сетка (8)»), над которой строятся и `formatStageSpecSummary` (пресеты,
 * `FormatStageSpec` — конфиги всегда объекты), и `stageSchemaSummary` (живые
 * `Stage` номинации — `groups`/`bracket` нулевые, если этап другого типа).
 * Групповой этап без заданного числа групп (0019, FR-9) подписывается просто
 * «Группы» — число ещё не выбрано.
 */
function stageTypeSummary(spec: { type: StageType; groupCount: number; bracketSize: number }): string {
  switch (spec.type) {
    case "STAGE_TYPE_GROUPS":
      return spec.groupCount > 0 ? `Группы (${spec.groupCount})` : "Группы";
    case "STAGE_TYPE_BRACKET":
      return `Сетка (${spec.bracketSize})`;
    default:
      return "—";
  }
}

/**
 * formatStageSpecSummary — краткая подпись одного этапа пресета: тип +
 * ключевой параметр конфига («Группы (2)», «Сетка (8)»). Групповой этап без
 * заданного числа групп (0019, FR-9) подписывается просто «Группы» — число
 * ещё не выбрано.
 */
function formatStageSpecSummary(stage: FormatStageSpec): string {
  return stageTypeSummary({ type: stage.type, groupCount: stage.groups.groupCount, bracketSize: stage.bracket.size });
}

/**
 * formatPresetSummary — краткая подпись схемы пресета целиком для карточки
 * библиотеки форматов (спека 0020, FR-11/FR-12), например «Группы (2) →
 * Сетка (8) → Сетка (8)». Это не полноценная схема с уровнями
 * (`groupStagesByLevel`) — просто перечисление этапов пресета в порядке
 * `stages`, через « → »: библиотечной карточке нужен беглый обзор формата, а
 * не точное дерево веток (экран схемы номинации показывает уровни отдельно).
 * Пустая схема (пресет без этапов — на практике недостижимо, миграция 00004
 * требует непустой массив) даёт пустую строку.
 */
export function formatPresetSummary(preset: FormatPreset): string {
  if (preset.stages.length === 0) return "";
  return preset.stages.map(formatStageSpecSummary).join(" → ");
}

/**
 * stageSchemaSummary — краткая сводка схемы этапов номинации для колонки
 * списка (спека 0028, FR-5), например «Группы (4) → Сетка (8)»: уровни
 * (`groupStagesByLevel`, 0019, FR-10) идут через « → », параллельные ветки
 * одного уровня — через « + ». Пустая строка — когда схемы фактически нет
 * (спека 0028, FR-5): этапов нет вовсе либо единственный этап — групповой
 * без заданного числа групп (авто-этап, 0017, FR-4 / 0019, FR-9). Подпись
 * «Схема не задана» — забота вызывающего UI, не этой функции (см. plan.md).
 */
export function stageSchemaSummary(stages: Stage[]): string {
  if (stages.length === 0) return "";
  if (stages.length === 1) {
    const [only] = stages;
    if (only.type === "STAGE_TYPE_GROUPS" && (only.groups === null || only.groups.groupCount === 0)) {
      return "";
    }
  }
  return groupStagesByLevel(stages)
    .map((level) =>
      level
        .map((stage) =>
          stageTypeSummary({
            type: stage.type,
            groupCount: stage.groups?.groupCount ?? 0,
            bracketSize: stage.bracket?.size ?? 0,
          }),
        )
        .join(" + "),
    )
    .join(" → ");
}

/**
 * schemaErrorCount — число проблем схемы уровня «ошибка» (спека 0028,
 * FR-5/AC-4): предупреждения и информационные пункты в списке номинаций не
 * показываются, их место — экран схемы (0031/0032).
 */
export function schemaErrorCount(issues: SchemaIssue[]): number {
  return issues.filter((issue) => issue.severity === "SCHEMA_ISSUE_SEVERITY_ERROR").length;
}
