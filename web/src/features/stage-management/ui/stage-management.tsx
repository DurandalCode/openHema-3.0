"use client";

import { Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { poolLayoutStatusLabel } from "@/entities/pool/lib/types";
import { stageTypeLabel } from "@/entities/stage/lib/labels";
import type { Stage } from "@/entities/stage/lib/types";
import { useStages } from "../api/use-stages";
import { useDeleteStage } from "../api/use-delete-stage";
import { CreateStageDialog } from "./create-stage-dialog";

/**
 * StageManagement — список этапов номинации + добавление этапа-сетки
 * (спека 0018, FR-1/FR-2/FR-3/FR-18). Групповой этап удалить нельзя (AC-14) —
 * кнопка удаления показана только у сеток, сервер всё равно перепроверяет
 * гейт.
 */
export function StageManagement({ nominationId }: { nominationId: string }) {
  const { data: stages, isLoading, error } = useStages(nominationId);
  const deleteStage = useDeleteStage(nominationId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (error || !stages) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Не удалось загрузить этапы"}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Col gap={4}>
      <Row align="center" justify="between" gap={3} className="flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">Этапы номинации</h2>
        <CreateStageDialog nominationId={nominationId} />
      </Row>

      {deleteStage.error && (
        <Alert variant="destructive">
          <AlertDescription>{deleteStage.error.message}</AlertDescription>
        </Alert>
      )}

      <Col gap={2}>
        {stages.map((stage) => (
          <StageCard
            key={stage.id}
            stage={stage}
            onDelete={() => deleteStage.mutate(stage.id)}
            deletePending={deleteStage.isPending}
          />
        ))}
        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground">Этапов ещё нет.</p>
        )}
      </Col>
    </Col>
  );
}

function StageCard({
  stage,
  onDelete,
  deletePending,
}: {
  stage: Stage;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const isBracket = stage.type === "STAGE_TYPE_BRACKET";
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <Row align="center" gap={2} className="flex-wrap">
          <span className="font-medium">{stage.title}</span>
          <Badge variant="secondary">{stageTypeLabel(stage.type)}</Badge>
          <Badge variant={stage.status === "POOL_LAYOUT_STATUS_READY" ? "default" : "outline"}>
            {poolLayoutStatusLabel(stage.status)}
          </Badge>
          {isBracket && stage.bracket && (
            <span className="text-xs text-muted-foreground">
              {stage.bracket.size} слотов{stage.bracket.thirdPlace ? ", бой за 3-е место" : ""}
            </span>
          )}
        </Row>
        {isBracket && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            loading={deletePending}
            aria-label={`Удалить ${stage.title}`}
          >
            <Trash2 />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
