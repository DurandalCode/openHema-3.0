"use client";

import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { poolLayoutStatusLabel } from "@/entities/pool/lib/types";
import { groupStagesByLevel, stageRuleLabel, stageTypeLabel } from "@/entities/stage/lib/labels";
import type { Stage } from "@/entities/stage/lib/types";

export type NominationSchemaMode = "admin" | "public";

export type NominationSchemaProps = {
  /** Этапы номинации — вся схема целиком, не один уровень (спека 0019, FR-25/FR-26). */
  stages: Stage[];
  mode: NominationSchemaMode;
  /**
   * renderActions — слот под admin-действия конкретного этапа (кнопки
   * «Задать правило» / «Сформировать» / «Расформировать» и т.п.). Виджет
   * сам ничего не мутирует и не делает запросов (FR-25) — конкретные
   * действия остаются за `features/**`, сюда приходят уже готовым
   * render-prop'ом. Вызывается только в `mode = "admin"`: в `mode = "public"`
   * слот не рендерится, даже если передан (FR-26).
   */
  renderActions?: (stage: Stage) => ReactNode;
};

/**
 * sourceStageTitle — «из: <title>» для сформированного правилом этапа
 * (FR-27): название этапа-источника ищется в том же списке `stages`, что и
 * весь виджет получил — отдельного запроса не делает. Для источника-ростера
 * и для этапа без правила подсказки нет: у ростера нет своего названия, а
 * этап без правила ни от кого не питается (FR-1).
 */
function sourceStageTitle(stage: Stage, stages: Stage[]): string {
  if (!stage.rule || stage.rule.sourceKind !== "STAGE_SOURCE_KIND_STAGE") return "";
  return stages.find((s) => s.id === stage.rule?.sourceStageId)?.title ?? "";
}

function StageCard({
  stage,
  stages,
  mode,
  renderActions,
}: {
  stage: Stage;
  stages: Stage[];
  mode: NominationSchemaMode;
  renderActions?: (stage: Stage) => ReactNode;
}) {
  const origin = sourceStageTitle(stage, stages);
  return (
    <Card className="min-w-[220px] gap-3 py-4" data-testid="stage-card">
      <CardHeader className="px-4">
        <Row align="center" justify="between" gap={2} className="flex-wrap">
          <CardTitle className="text-sm">{stage.title}</CardTitle>
          <Badge variant="outline">{stageTypeLabel(stage.type)}</Badge>
        </Row>
      </CardHeader>
      <CardContent className="px-4">
        <Col gap={1}>
          <Row gap={2} className="flex-wrap">
            <Badge>{poolLayoutStatusLabel(stage.status)}</Badge>
          </Row>
          {stage.rule && (
            <span className="text-xs text-muted-foreground">{stageRuleLabel(stage.rule, stages)}</span>
          )}
          {origin && <span className="text-xs text-muted-foreground">из: {origin}</span>}
          {mode === "admin" && renderActions && <div className="pt-1">{renderActions(stage)}</div>}
        </Col>
      </CardContent>
    </Card>
  );
}

/**
 * NominationSchema — схема номинации целиком: этапы по уровням, параллельные
 * ветки — рядом (спека 0019, FR-10/FR-12/FR-25/FR-26). Чистое отображение
 * пропсов: не мутирует, не делает запросов, ничего не знает про `features`.
 *
 * Уровни — результат `groupStagesByLevel` (`entities/stage/lib/labels.ts`):
 * один уровень = одна `position`, этапы, питающиеся от общего источника,
 * делят уровень (FR-10). Линейная схема (один этап на уровень) выглядит
 * как раньше — плоским списком сверху вниз (регресс сценария 0018, FR-28).
 *
 * `mode = "public"` — read-only проекция для зрителя (FR-26): те же уровни и
 * подписи, без admin-слота действий.
 */
export function NominationSchema({ stages, mode, renderActions }: NominationSchemaProps) {
  const levels = groupStagesByLevel(stages);
  return (
    <Col gap={4} data-testid="nomination-schema">
      {levels.map((level, index) => (
        <Row key={`level-${index}`} gap={3} wrap align="start" data-testid="schema-level">
          {level.map((stage) => (
            <StageCard key={stage.id} stage={stage} stages={stages} mode={mode} renderActions={renderActions} />
          ))}
        </Row>
      ))}
    </Col>
  );
}
