"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { stageConfigLabel, stageExecutionStatusLabel, stageTypeLabel } from "@/entities/stage/lib/labels";
import { stageProgressFromSnapshot } from "@/entities/stage/lib/progress";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";
import { useLiveSnapshot } from "@/features/nomination-live/api/use-live-snapshot";
import { SchemaDiagnostics } from "@/widgets/nomination-schema/schema-diagnostics";

/**
 * StageRail — правый рельс страницы этапа (спека 0032, FR-17..FR-20,
 * AC-11/AC-12/AC-13): список этапов номинации в порядке схемы (`stages`
 * приходит уже упорядоченным от вызывающего — `useStages`, здесь не
 * пересортировывается) со ссылками на страницы этапов, пометкой текущего
 * этапа и счётчиками боёв, плюс диагностика схемы снизу.
 *
 * Счётчики (`stageProgressFromSnapshot`, NFR-5) берутся из собственного
 * `useLiveSnapshot(nominationId)` — рельс не переиспользует запрос тела
 * страницы: снапшот один на номинацию и кэшируется TanStack Query по
 * общему ключу, второй сети не возникает. Этап без записи в снапшоте
 * (черновик — раскладка ещё не зафиксирована) показывает только конфиг и
 * статус, без «0 из 0» (FR-18, второй кейс AC-12).
 *
 * Диагностика — переиспользованный `SchemaDiagnostics`
 * (`widgets/nomination-schema/schema-diagnostics.tsx`, спека 0031, FR-6):
 * виджету дозволено импортировать другой виджет (правило 6
 * `web/AGENTS.md` запрещает это только фичам), логика не дублируется.
 */
export function StageRail({
  nominationId,
  currentStageId,
  stages,
  issues,
}: {
  nominationId: string;
  currentStageId: string;
  stages: Stage[];
  issues: SchemaIssue[];
}) {
  const { data: snapshot } = useLiveSnapshot(nominationId);
  const progress = snapshot ? stageProgressFromSnapshot(snapshot) : {};

  return (
    <Col gap={4} data-testid="stage-rail">
      <Col gap={2} data-testid="stage-rail-list">
        {stages.map((stage) => {
          const isCurrent = stage.id === currentStageId;
          const stageProgress = progress[stage.id];
          const configLabel = stageConfigLabel(stage);

          return (
            <Link
              key={stage.id}
              href={`/admin/nominations/${nominationId}/stages/${stage.id}`}
              data-testid="stage-rail-item"
              aria-current={isCurrent ? "page" : undefined}
            >
              <Card
                className={cn(
                  "gap-2 py-3 transition-colors hover:border-primary",
                  isCurrent && "border-primary",
                )}
              >
                <CardContent className="px-4">
                  <Col gap={1}>
                    <Row align="center" justify="between" gap={2}>
                      <span className="text-sm font-semibold">{stage.title}</span>
                      {isCurrent && (
                        <Row
                          align="center"
                          gap={1}
                          className="text-xs font-medium text-primary"
                          data-testid="stage-rail-current-marker"
                        >
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          текущий
                        </Row>
                      )}
                    </Row>
                    <Row align="center" gap={2} className="flex-wrap">
                      <Badge variant="outline">{stageTypeLabel(stage.type)}</Badge>
                      <Badge>{stageExecutionStatusLabel(stage.executionStatus)}</Badge>
                      {configLabel && <Badge variant="secondary">{configLabel}</Badge>}
                    </Row>
                    {stageProgress && (
                      <span className="text-xs text-muted-foreground">
                        {stageProgress.fighters} бойцов · {stageProgress.boutsFinished} из{" "}
                        {stageProgress.boutsTotal} боёв
                      </span>
                    )}
                  </Col>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </Col>

      <Col gap={2}>
        <SchemaDiagnostics issues={issues} />
        <Link
          href={`/admin/nominations/${nominationId}/stages`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Открыть схему →
        </Link>
      </Col>
    </Col>
  );
}
