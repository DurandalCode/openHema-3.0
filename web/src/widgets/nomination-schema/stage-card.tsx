"use client";

import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import { ArrowRight, Settings, Trash2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Card, CardContent, CardFooter, CardHeader } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { toastError, toastUndo } from "@/shared/lib/toast";
import { poolLayoutStatusLabel } from "@/entities/pool/lib/types";
import { stageConfigLabel, stageRuleLabel, stageTypeLabel } from "@/entities/stage/lib/labels";
import type { SchemaIssue, SchemaIssueSeverity, Stage } from "@/entities/stage/lib/types";
import { BuildStageDialog } from "@/features/stage-build/ui/build-stage-dialog";
import { useResetLayout } from "@/features/nomination-pools/api/use-reset-layout";
import { useUndo } from "@/features/nomination-pools/api/use-undo";
import { useResetBracket } from "@/features/bracket-seeding/api/use-reset-bracket";
import { useUndoBracket } from "@/features/bracket-seeding/api/use-undo-bracket";

/**
 * dragId/dropId — конвенция dnd-идентификаторов схемы (спека 0031,
 * FR-13..FR-16): карточка одновременно источник (перенос на другую карточку,
 * FR-16) и цель (приём броска палитры/карточки, FR-13..FR-16) переноса.
 * `data` каждого узла — уже готовый фрагмент `SchemaDragSource`/цели, чтобы
 * `onDragEnd` корня экрана (`nomination-schema-screen.tsx`, join-волна T15)
 * мог собрать `resolveSchemaDrop(source, target)` без доп. маппинга:
 * `active.data.current` → `{ kind: "stage", stageId }`, `over.data.current`
 * → `{ stageId }` (тот же `stageId`, что и у карточки — «бросок на себя»
 * `resolveSchemaDrop` отфильтрует сам). Палитра (`schema-palette.tsx`) и
 * пустая зона холста (`schema-canvas.tsx`) следуют той же конвенции для
 * `{ kind: "palette", item }` и `{ stageId: null }` соответственно.
 */
const dragId = (stageId: string) => `stage-drag:${stageId}`;
const dropId = (stageId: string) => `stage-drop:${stageId}`;

/** typeDotClass — цветовая метка типа этапа (FR-9); текст рядом (`stageTypeLabel`) остаётся основным источником смысла (NFR-4). */
function typeDotClass(type: Stage["type"]): string {
  return type === "STAGE_TYPE_BRACKET" ? "bg-chart-2" : "bg-chart-1";
}

function severityBadgeProps(
  severity: SchemaIssueSeverity,
): { variant: "destructive" | "outline" | "secondary"; className?: string } {
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

/**
 * StageCard — карточка этапа на холсте схемы (спека 0031, FR-9/FR-10/FR-11):
 * тип (цвет + текст), название, статус, сводка конфига, подпись правила
 * отбора, проблемы этого этапа (FR-7 — фильтр общего `issues` по
 * `stageIds`), футер со ссылкой «Посев →» (FR-10, первая и единственная
 * ссылка на `stages/[stageId]` во всём приложении) и кнопками «Настроить»
 * (открывает инспектор, FR-18) / «Удалить» — обе колбэками: экран решает,
 * что делать (открыть инспектор, показать подтверждение), карточка сама
 * не мутирует данные этапа как сущности.
 *
 * Исключение — «Сформировать»/«Расформировать» (FR-11): у этапов с заданным
 * правилом отбора те же самодостаточные элементы, что были в старом
 * `stage-management.tsx` (`StageQuickActions`) — `BuildStageDialog` (свой
 * триггер и диалог формирования) и кнопка сброса с собственным
 * `ConfirmDialog` (спека 0023, T28-finding — сброс всегда подтверждается,
 * отмена — тостом с «Отменить»). Перенесено сюда как есть, без изменения
 * поведения: виджету дозволено импортировать несколько фич (в отличие от
 * `features/*`, которым нельзя импортировать друг друга, правило 6
 * `web/AGENTS.md`).
 */
export function StageCard({
  stage,
  stages,
  nominationId,
  issues,
  onInspect,
  onDelete,
}: {
  stage: Stage;
  stages: Stage[];
  nominationId: string;
  issues: SchemaIssue[];
  onInspect: (stage: Stage) => void;
  onDelete: (stage: Stage) => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dragId(stage.id),
    data: { kind: "stage", stageId: stage.id },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId(stage.id),
    data: { stageId: stage.id },
  });

  const configLabel = stageConfigLabel(stage);
  const ruleLabel = stageRuleLabel(stage.rule, stages);
  const stageIssues = issues.filter((issue) => issue.stageIds.includes(stage.id));

  return (
    <div ref={setDropRef} data-testid="stage-card-drop-zone">
      <Card
        className={cn(
          "min-w-[240px] gap-3 py-4 transition-colors",
          isOver && "border-primary bg-accent",
          isDragging && "opacity-40",
        )}
        data-testid="stage-card"
      >
        <CardHeader className="px-4">
          <div
            ref={setDragRef}
            {...listeners}
            {...attributes}
            className="flex flex-wrap items-center gap-2 cursor-grab active:cursor-grabbing"
          >
            <span
              className={cn("size-2.5 shrink-0 rounded-full", typeDotClass(stage.type))}
              aria-hidden="true"
            />
            <span className="text-sm font-semibold">{stage.title}</span>
          </div>
          <Row align="center" gap={2} className="flex-wrap pt-1">
            <Badge variant="outline">{stageTypeLabel(stage.type)}</Badge>
            <Badge>{poolLayoutStatusLabel(stage.status)}</Badge>
            {configLabel && <Badge variant="secondary">{configLabel}</Badge>}
          </Row>
        </CardHeader>
      <CardContent className="px-4">
        <Col gap={2}>
          <span className="text-xs text-muted-foreground">{ruleLabel}</span>

          {stageIssues.length > 0 && (
            <Row gap={1} className="flex-wrap" data-testid="stage-card-issues">
              {stageIssues.map((issue, index) => {
                const { variant, className } = severityBadgeProps(issue.severity);
                return (
                  <Badge key={`${issue.code}-${index}`} variant={variant} className={className}>
                    {issue.message}
                  </Badge>
                );
              })}
            </Row>
          )}

          {stage.rule && (
            <Row gap={2} className="flex-wrap items-center pt-1">
              <BuildStageDialog stage={stage} />
              <ResetQuickAction stage={stage} />
            </Row>
          )}
        </Col>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 px-4">
        <Link
          href={`/admin/nominations/${nominationId}/stages/${stage.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Посев <ArrowRight className="size-3.5" />
        </Link>
        <Row gap={1}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onInspect(stage)}
            aria-label="Настроить"
          >
            <Settings />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(stage)}
            aria-label={`Удалить ${stage.title}`}
          >
            <Trash2 />
          </Button>
        </Row>
      </CardFooter>
      </Card>
    </div>
  );
}

/**
 * ResetQuickAction — «Расформировать» (FR-11): тот же гейт по типу этапа,
 * что `StageQuickActions` в старом `stage-management.tsx` — групповой этап
 * сбрасывает раскладку (`nomination-pools`), сетка — посев
 * (`bracket-seeding`). Оба «Отменить»-тоста зовут соответствующий `undo`.
 */
function ResetQuickAction({ stage }: { stage: Stage }) {
  const isBracket = stage.type === "STAGE_TYPE_BRACKET";

  const resetLayout = useResetLayout(stage.id);
  const resetBracket = useResetBracket(stage.id);
  const undoLayout = useUndo(stage.id);
  const undoBracket = useUndoBracket(stage.id);
  const resetPending = isBracket ? resetBracket.isPending : resetLayout.isPending;
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleResetConfirm() {
    if (isBracket) {
      resetBracket.mutate(undefined, {
        onSuccess: () => toastUndo("Посев сброшен", { onUndo: () => undoBracket.mutate() }),
        onError: (err: Error) => toastError(err.message, { retry: handleResetConfirm }),
      });
    } else {
      resetLayout.mutate(undefined, {
        onSuccess: () => toastUndo("Раскладка сброшена", { onUndo: () => undoLayout.mutate() }),
        onError: (err: Error) => toastError(err.message, { retry: handleResetConfirm }),
      });
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setConfirmOpen(true)}
        loading={resetPending}
      >
        Расформировать
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Расформировать «${stage.title}»?`}
        consequences={
          isBracket ? "Все слоты будут очищены." : "Все пулы будут удалены, бойцы вернутся в нераспределённые."
        }
        confirmLabel="Да, расформировать"
        destructive
        onConfirm={handleResetConfirm}
      />
    </>
  );
}
