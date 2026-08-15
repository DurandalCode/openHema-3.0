import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col } from "@/shared/ui/stack";
import { stageExecutionStatusLabel, stageRuleLabel } from "@/entities/stage/lib/labels";
import type { Stage } from "@/entities/stage/lib/types";

/**
 * stageExecutionStatusExplanation — что статус выполнения значит для правки
 * состава (спека 0032, FR-6): человекочитаемое пояснение рядом со статусом,
 * не просто повтор подписи.
 */
function stageExecutionStatusExplanation(status: Stage["executionStatus"]): string {
  switch (status) {
    case "STAGE_STATUS_DRAFT":
      return "Состав ещё не зафиксирован — можно свободно менять руками или переформировать.";
    case "STAGE_STATUS_READY":
      return "Состав зафиксирован, бои ещё не начаты.";
    case "STAGE_STATUS_ACTIVE":
      return "Идут бои — состав этапа менять нельзя.";
    case "STAGE_STATUS_FINISHED":
      return "Все бои этапа завершены.";
    default:
      return "";
  }
}

/**
 * StageSummaryCards — три карточки сводки этапа (спека 0032, FR-6..FR-8,
 * AC-2): «Статус этапа», «Правило отбора» (ссылка на экран схемы — правило
 * там же правится, 0031 FR-21, а не здесь, «Вне скоупа») и «Заполнено».
 * Видны на всех этапах обоих типов (FR-7) — `stageRuleLabel` уже отдаёт
 * «Правила нет — набирается руками» для `rule = null`, спецкейса не нужно.
 * `filled`/`capacity` считает вызывающий (групповая/сеточная логика — join-
 * волна), карточка их только показывает.
 */
export function StageSummaryCards({
  stage,
  stages,
  nominationId,
  filled,
  capacity,
}: {
  stage: Stage;
  stages: Stage[];
  nominationId: string;
  filled: number;
  capacity: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="stage-summary-cards">
      <Card data-testid="stage-summary-status">
        <CardHeader>
          <CardTitle>Статус этапа</CardTitle>
        </CardHeader>
        <CardContent>
          <Col gap={1}>
            <span className="text-lg font-semibold">
              {stageExecutionStatusLabel(stage.executionStatus)}
            </span>
            <span className="text-sm text-muted-foreground">
              {stageExecutionStatusExplanation(stage.executionStatus)}
            </span>
          </Col>
        </CardContent>
      </Card>

      <Card data-testid="stage-summary-rule">
        <CardHeader>
          <CardTitle>Правило отбора</CardTitle>
        </CardHeader>
        <CardContent>
          <Col gap={1}>
            <span className="text-sm">{stageRuleLabel(stage.rule, stages)}</span>
            <Link
              href={`/admin/nominations/${nominationId}/stages`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Править на схеме →
            </Link>
          </Col>
        </CardContent>
      </Card>

      <Card data-testid="stage-summary-filled">
        <CardHeader>
          <CardTitle>Заполнено</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-lg font-semibold">
            {filled} / {capacity}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
