"use client";

import { Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import { NominationSchema } from "@/widgets/nomination-schema/nomination-schema";
import { BuildStageDialog } from "@/features/stage-build/ui/build-stage-dialog";
import { useResetLayout } from "@/features/nomination-pools/api/use-reset-layout";
import { useResetBracket } from "@/features/bracket-seeding/api/use-reset-bracket";
import { ApplyFormatDialog } from "@/features/format-presets/ui/apply-format-dialog";
import { SavePresetDialog } from "@/features/format-presets/ui/save-preset-dialog";
import { stageErrorMessage } from "@/entities/stage/lib/errors";
import type { Stage } from "@/entities/stage/lib/types";
import { useStages } from "../api/use-stages";
import { useDeleteStage } from "../api/use-delete-stage";
import { CreateStageDialog } from "./create-stage-dialog";
import { EditStageDialog } from "./edit-stage-dialog";

/**
 * StageManagement — схема номинации целиком (спека 0019, FR-25) + сборка
 * схемы (спека 0020): добавление/редактирование этапа, диагностика (FR-8),
 * применение формата и сохранение как пресет (FR-13/FR-15/FR-12). Уровни и
 * параллельные ветки — `NominationSchema` (виджет, читает только пропсы, в
 * т.ч. `issues`); быстрые действия конкретного этапа — здесь, через
 * render-prop `renderActions` (виджет ничего не мутирует сам).
 *
 * Удаление (0018 FR-3, 0019 FR-7a; спека 0020 FR-5 — авто-этап больше не
 * особенный): любой этап удаляется, пока в нём не начат ни один бой и он не
 * служит источником другой ветки — сервер перепроверяет оба гейта.
 *
 * «Сформировать»/«Расформировать» (FR-13/FR-17) показаны только у этапов с
 * заданным правилом отбора — у остальных состав набирается вручную на
 * странице этапа, как раньше (0009/0018).
 */
export function StageManagement({ nominationId }: { nominationId: string }) {
  const { data, isLoading, error } = useStages(nominationId);
  const deleteStage = useDeleteStage(nominationId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Не удалось загрузить этапы"}</AlertDescription>
      </Alert>
    );
  }
  const { stages, issues } = data;

  return (
    <Col gap={4}>
      <Row align="center" justify="between" gap={3} className="flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">Схема номинации</h2>
        <Row gap={2} className="flex-wrap">
          <SavePresetDialog nominationId={nominationId} />
          <ApplyFormatDialog nominationId={nominationId} />
          <CreateStageDialog nominationId={nominationId} stages={stages} />
        </Row>
      </Row>

      {deleteStage.error && (
        <Alert variant="destructive">
          <AlertDescription>{stageErrorMessage(deleteStage.error.message)}</AlertDescription>
        </Alert>
      )}

      {stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Этапов ещё нет.</p>
      ) : (
        <NominationSchema
          stages={stages}
          issues={issues}
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

  const resetLayout = useResetLayout(stage.id);
  const resetBracket = useResetBracket(stage.id);
  const resetPending = isBracket ? resetBracket.isPending : resetLayout.isPending;
  const onReset = () => (isBracket ? resetBracket.mutate() : resetLayout.mutate());

  // composeEmpty (спека 0020, FR-2): точного числа членств этапа список
  // этапов не несёт (его даёт только GetLayout, отдельным запросом на
  // этап). Draft без фиксации — оптимистичное предположение «можно
  // редактировать конфиг», сервер (ErrStageLocked) перепроверит и покажет
  // ошибку в диалоге, если бойцы уже расставлены вручную; зафиксированный
  // (ready) этап — заведомо не пуст, поля блокируются сразу.
  const composeEmpty = stage.status === "POOL_LAYOUT_STATUS_DRAFT";

  return (
    <Row gap={2} className="flex-wrap items-center">
      <EditStageDialog stage={stage} composeEmpty={composeEmpty} />
      {stage.rule && <BuildStageDialog stage={stage} />}
      {stage.rule && (
        <Button type="button" size="sm" variant="ghost" onClick={onReset} loading={resetPending}>
          Расформировать
        </Button>
      )}
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
    </Row>
  );
}
