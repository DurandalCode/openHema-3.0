"use client";

import { Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import { NominationSchema } from "@/widgets/nomination-schema/nomination-schema";
import { BuildStageDialog } from "@/features/stage-build/ui/build-stage-dialog";
import { useResetLayout } from "@/features/nomination-pools/api/use-reset-layout";
import { useResetBracket } from "@/features/bracket-seeding/api/use-reset-bracket";
import type { Stage } from "@/entities/stage/lib/types";
import { useStages } from "../api/use-stages";
import { useDeleteStage } from "../api/use-delete-stage";
import { CreateStageDialog } from "./create-stage-dialog";

/**
 * StageManagement — схема номинации целиком (спека 0019, FR-25) + добавление
 * этапа. Уровни и параллельные ветки — `NominationSchema` (виджет, читает
 * только пропсы); быстрые действия конкретного этапа — здесь, через
 * render-prop `renderActions` (виджет ничего не мутирует сам).
 *
 * Удаление (0018 FR-3, 0019 FR-7a): авто-этап (`type=groups` без `groups`,
 * FR-9) удалить нельзя — кнопка не показывается; сервер всё равно
 * перепроверяет гейт (в т.ч. «этап — источник другой ветки», FR-7a).
 *
 * «Сформировать»/«Расформировать» (FR-13/FR-17) показаны только у этапов с
 * заданным правилом отбора — у остальных состав набирается вручную на
 * странице этапа, как раньше (0009/0018).
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
        <h2 className="text-sm font-medium text-muted-foreground">Схема номинации</h2>
        <CreateStageDialog nominationId={nominationId} stages={stages} />
      </Row>

      {deleteStage.error && (
        <Alert variant="destructive">
          <AlertDescription>{deleteStage.error.message}</AlertDescription>
        </Alert>
      )}

      {stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Этапов ещё нет.</p>
      ) : (
        <NominationSchema
          stages={stages}
          mode="admin"
          renderActions={(stage) => (
            <StageQuickActions
              stage={stage}
              onDelete={() => deleteStage.mutate(stage.id)}
              deletePending={deleteStage.isPending}
            />
          )}
        />
      )}
    </Col>
  );
}

function StageQuickActions({
  stage,
  onDelete,
  deletePending,
}: {
  stage: Stage;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const isBracket = stage.type === "STAGE_TYPE_BRACKET";
  // Авто-этап (0017, FR-4): групповой этап без явного group_count (FR-9) —
  // удалить нельзя. Явно созданный групповой этап и любая сетка — можно
  // (0018 FR-3, 0019 FR-7a); сервер дополнительно гейтит «этап — источник».
  const deletable = isBracket || stage.groups !== null;

  const resetLayout = useResetLayout(stage.id);
  const resetBracket = useResetBracket(stage.id);
  const resetPending = isBracket ? resetBracket.isPending : resetLayout.isPending;
  const onReset = () => (isBracket ? resetBracket.mutate() : resetLayout.mutate());

  return (
    <Row gap={2} className="flex-wrap items-center">
      {stage.rule && <BuildStageDialog stage={stage} />}
      {stage.rule && (
        <Button type="button" size="sm" variant="ghost" onClick={onReset} loading={resetPending}>
          Расформировать
        </Button>
      )}
      {deletable && (
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
    </Row>
  );
}
