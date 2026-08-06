"use client";

import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { poolLayoutStatusLabel } from "@/entities/pool/lib/types";
import { groupStagesByLevel, stageRuleLabel, stageTypeLabel } from "@/entities/stage/lib/labels";
import type { SchemaIssue, SchemaIssueSeverity, Stage } from "@/entities/stage/lib/types";

export type NominationSchemaMode = "admin" | "public";

export type NominationSchemaProps = {
  /** Этапы номинации — вся схема целиком, не один уровень (спека 0019, FR-25/FR-26). */
  stages: Stage[];
  mode: NominationSchemaMode;
  /**
   * issues — диагностика схемы (спека 0020, FR-8): приходит вместе со
   * списком этапов (`ListStagesResponse.issues`), виджет её только
   * отображает — тексты и привязка к этапам (`stageIds`) уже готовы
   * сервером. Показывается только в `mode = "admin"` — публичный экран
   * диагностику не видит (FR-19). Не передан либо пуст — блока диагностики
   * нет вовсе.
   */
  issues?: SchemaIssue[];
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
 * severityTestId/severityBadgeProps — три визуально различимых класса
 * диагностики (спека 0020, FR-8): ошибка — `variant="destructive"`
 * (семантический токен `--destructive`, уже используется проектом для
 * отказов); предупреждение — контурная плашка, подсвеченная тем же жёлтым
 * тоном, что Tailwind даёт `amber-*` (в проекте нет отдельного токена
 * «warning» — `web/AGENTS.md` требует не хардкодить hex, поэтому берём
 * именованную Tailwind-палитру, а не произвольное значение); информация —
 * `variant="secondary"`, нейтральная плашка без тревожного смысла.
 */
function severityTestId(severity: SchemaIssueSeverity): string {
  switch (severity) {
    case "SCHEMA_ISSUE_SEVERITY_ERROR":
      return "error";
    case "SCHEMA_ISSUE_SEVERITY_WARNING":
      return "warning";
    case "SCHEMA_ISSUE_SEVERITY_INFO":
      return "info";
    default:
      return "unspecified";
  }
}

function severityBadgeProps(severity: SchemaIssueSeverity): { variant: "destructive" | "outline" | "secondary"; className?: string } {
  switch (severity) {
    case "SCHEMA_ISSUE_SEVERITY_ERROR":
      return { variant: "destructive" };
    case "SCHEMA_ISSUE_SEVERITY_WARNING":
      return { variant: "outline", className: "border-amber-500/60 text-amber-600 dark:text-amber-400" };
    case "SCHEMA_ISSUE_SEVERITY_INFO":
      return { variant: "secondary" };
    default:
      return { variant: "outline" };
  }
}

function IssueBadge({ issue, testIdPrefix }: { issue: SchemaIssue; testIdPrefix: string }) {
  const { variant, className } = severityBadgeProps(issue.severity);
  return (
    <Badge variant={variant} className={className} data-testid={`${testIdPrefix}-${severityTestId(issue.severity)}`}>
      {issue.message}
    </Badge>
  );
}

/**
 * SchemaIssuesSummary — общий блок диагностики над уровнями схемы (спека
 * 0020, FR-8): по одной плашке на встретившийся класс проблем со счётчиком —
 * беглый обзор без нужды пробегать все карточки этапов. Не рендерится вовсе,
 * если `issues` пуст (вызывающая сторона это уже проверяет).
 */
function SchemaIssuesSummary({ issues }: { issues: SchemaIssue[] }) {
  const bySeverity = new Map<SchemaIssueSeverity, SchemaIssue[]>();
  for (const issue of issues) {
    const group = bySeverity.get(issue.severity);
    if (group) group.push(issue);
    else bySeverity.set(issue.severity, [issue]);
  }
  return (
    <Row gap={2} className="flex-wrap" data-testid="schema-issues-summary">
      {[...bySeverity.entries()].map(([severity, group]) => (
        <IssueBadge
          key={severity}
          issue={{ severity, code: "SCHEMA_ISSUE_CODE_UNSPECIFIED", stageIds: [], message: `${severityCountLabel(severity)}: ${group.length}` }}
          testIdPrefix="schema-issues-summary"
        />
      ))}
    </Row>
  );
}

function severityCountLabel(severity: SchemaIssueSeverity): string {
  switch (severity) {
    case "SCHEMA_ISSUE_SEVERITY_ERROR":
      return "Ошибки";
    case "SCHEMA_ISSUE_SEVERITY_WARNING":
      return "Предупреждения";
    case "SCHEMA_ISSUE_SEVERITY_INFO":
      return "Информация";
    default:
      return "—";
  }
}

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
  issues,
  renderActions,
}: {
  stage: Stage;
  stages: Stage[];
  mode: NominationSchemaMode;
  issues: SchemaIssue[];
  renderActions?: (stage: Stage) => ReactNode;
}) {
  const origin = sourceStageTitle(stage, stages);
  const stageIssues = mode === "admin" ? issues.filter((issue) => issue.stageIds.includes(stage.id)) : [];
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
          {stageIssues.length > 0 && (
            <Row gap={1} className="flex-wrap pt-1" data-testid="stage-issues">
              {stageIssues.map((issue, index) => (
                <IssueBadge key={`${issue.code}-${index}`} issue={issue} testIdPrefix="schema-issue" />
              ))}
            </Row>
          )}
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
 * подписи, без admin-слота действий и без диагностики (`issues`, FR-19).
 */
export function NominationSchema({ stages, mode, issues, renderActions }: NominationSchemaProps) {
  const levels = groupStagesByLevel(stages);
  const activeIssues = mode === "admin" ? (issues ?? []) : [];
  return (
    <Col gap={4} data-testid="nomination-schema">
      {activeIssues.length > 0 && <SchemaIssuesSummary issues={activeIssues} />}
      {levels.map((level, index) => (
        <Row key={`level-${index}`} gap={3} wrap align="start" data-testid="schema-level">
          {level.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              stages={stages}
              mode={mode}
              issues={activeIssues}
              renderActions={renderActions}
            />
          ))}
        </Row>
      ))}
    </Col>
  );
}
