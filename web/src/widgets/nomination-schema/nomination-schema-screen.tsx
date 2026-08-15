"use client";

import { useState } from "react";
import Link from "next/link";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { PageHeader } from "@/shared/ui/page-header";
import { Col, Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { Nomination } from "@/entities/nomination/lib/types";
import { nominationStatusTag } from "@/entities/nomination/lib/types";
import { stageErrorMessage } from "@/entities/stage/lib/errors";
import { resolveSchemaDrop, type SchemaDragSource, type StageTypeChoice } from "@/entities/stage/lib/schema-drag";
import type { Stage } from "@/entities/stage/lib/types";
import { useNomination } from "@/features/nomination-management/api/use-nomination";
import { NominationInlineHeader } from "@/features/nomination-management/ui/nomination-inline-header";
import { PresetChips } from "@/features/format-presets/ui/preset-chips";
import { useStages } from "@/features/stage-management/api/use-stages";
import { useSetStageRule } from "@/features/stage-management/api/use-set-stage-rule";
import { useDeleteStage } from "@/features/stage-management/api/use-delete-stage";
import { CreateStageDialog, type CreateStagePrefill } from "@/features/stage-management/ui/create-stage-dialog";
import { SchemaDiagnostics } from "./schema-diagnostics";
import { SchemaPalette } from "./schema-palette";
import { SchemaCanvas } from "./schema-canvas";
import { StageInspector } from "./stage-inspector";
import { SchemaSkeleton } from "./schema-skeleton";

/** stagesCountLabel — счётчик этапов для `PageHeader.meta` (FR-1), русское склонение по образцу соседних экранов (0024–0028). */
function stagesCountLabel(n: number): string {
  const mod100 = n % 100;
  if (mod100 < 11 || mod100 > 14) {
    const mod10 = n % 10;
    if (mod10 === 1) return `${n} этап`;
    if (mod10 >= 2 && mod10 <= 4) return `${n} этапа`;
  }
  return `${n} этапов`;
}

const ALL_SELECTOR_RULE = {
  selector: "STAGE_SELECTOR_KIND_ALL" as const,
  placeFrom: 0,
  placeTo: 0,
};

/**
 * NominationSchemaScreen — корень экрана «Схема номинации» (спека 0031):
 * палитра + холст + инспектор поверх схемы, собранные из трёх параллельных
 * треков (шапка номинации, пресеты формата, ядро конструктора). Композиция
 * живёт в `widgets` (не `features`) специально — правило 6 `web/AGENTS.md`
 * запрещает фичам импортировать друг друга, а этот экран собирает четыре:
 * `nomination-management`, `format-presets`, `stage-management` и дважды
 * — все дочерние компоненты внутри `widgets/nomination-schema/*`.
 *
 * `onDragEnd` — единственное место, где перетаскивание (FR-13..FR-16)
 * превращается в действие: `resolveSchemaDrop` (`entities/stage/lib`) даёт
 * чистый intent, здесь он либо открывает диалог создания с предзаполнением,
 * либо вызывает `useSetStageRule` — тот самый вызов, которого не было нигде
 * в приложении до этой спеки (0019, FR-6).
 *
 * Удаление с карточки (FR-24) — независимая от инспектора точка входа
 * (как и у инспектора, спека допускает такое дублирование — то же решение
 * пользователя, что дало фиксации состава вторую точку входа, FR-22):
 * свой `ConfirmDialog` и `useDeleteStage` на уровне экрана, а не обязательный
 * переход в инспектор ради удаления.
 */
export function NominationSchemaScreen({ nomination: initialNomination }: { nomination: Nomination }) {
  const nominationQuery = useNomination(initialNomination.id, initialNomination);
  const nomination = nominationQuery.data ?? initialNomination;

  const { data, isLoading, error, refetch } = useStages(nomination.id);
  const setRule = useSetStageRule(nomination.id);
  const deleteStage = useDeleteStage(nomination.id);

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<CreateStagePrefill | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Stage | null>(null);

  const stages = data?.stages ?? [];
  const issues = data?.issues ?? [];
  const selectedStage = stages.find((s) => s.id === selectedStageId) ?? null;

  function openCreate(type: StageTypeChoice, sourceStageId?: string) {
    setCreatePrefill(sourceStageId ? { type, sourceStageId } : { type });
    setCreateOpen(true);
  }

  function saveRule(stageId: string, rule: { sourceKind: "STAGE_SOURCE_KIND_ROSTER" | "STAGE_SOURCE_KIND_STAGE"; sourceStageId: string }) {
    setRule.mutate(
      { stageId, rule: { ...rule, ...ALL_SELECTOR_RULE } },
      {
        onSuccess: () => toastSuccess("Правило сохранено"),
        onError: (err: Error) => toastError(stageErrorMessage(err.message)),
      },
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const source = active.data.current as SchemaDragSource | undefined;
    if (!source) return;
    const overData = over.data.current as { stageId: string | null } | undefined;
    const target = overData ? overData.stageId : null;
    const intent = resolveSchemaDrop(source, target);

    if (intent.kind === "create-stage") {
      openCreate(intent.type, intent.sourceStageId);
    } else if (intent.kind === "set-roster-source") {
      saveRule(intent.stageId, { sourceKind: "STAGE_SOURCE_KIND_ROSTER", sourceStageId: "" });
    } else if (intent.kind === "set-stage-source") {
      saveRule(intent.stageId, { sourceKind: "STAGE_SOURCE_KIND_STAGE", sourceStageId: intent.sourceStageId });
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteStage.mutate(deleteTarget.id, {
      onSuccess: () => {
        toastSuccess("Этап удалён");
        setDeleteTarget(null);
      },
      onError: (err: Error) => toastError(stageErrorMessage(err.message)),
    });
  }

  return (
    <div data-slot="nomination-schema-screen" className="flex flex-col">
      <PageHeader
        crumb="СХЕМА НОМИНАЦИИ"
        title={nomination.title}
        status={<Badge>{nominationStatusTag(nomination.status)}</Badge>}
        meta={stagesCountLabel(stages.length)}
        secondary={
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/nominations">← Все номинации</Link>
          </Button>
        }
      />

      <NominationInlineHeader tournamentId={nomination.tournamentId} nomination={nomination} />

      <Col gap={4} className="p-4">
        <Row align="center" justify="between" gap={3} className="flex-wrap">
          <SchemaDiagnostics issues={issues} />
          <PresetChips nominationId={nomination.id} />
        </Row>

        {isLoading ? (
          <SchemaSkeleton />
        ) : error || !data ? (
          <Col gap={3} className="items-start">
            <p className="text-sm text-destructive">{error?.message ?? "Не удалось загрузить схему"}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Повторить
            </Button>
          </Col>
        ) : (
          <DndContext onDragEnd={onDragEnd}>
            <Row gap={6} align="start" wrap>
              <div className="w-full shrink-0 md:w-[200px]">
                <SchemaPalette />
              </div>
              <div className="min-w-0 flex-1">
                <SchemaCanvas
                  stages={stages}
                  issues={issues}
                  nominationId={nomination.id}
                  onInspect={(stage) => setSelectedStageId(stage.id)}
                  onDelete={(stage) => setDeleteTarget(stage)}
                  onCreateStage={(type) => openCreate(type)}
                />
              </div>
              {selectedStage && (
                <StageInspector
                  stage={selectedStage}
                  stages={stages}
                  nominationId={nomination.id}
                  onClose={() => setSelectedStageId(null)}
                />
              )}
            </Row>
          </DndContext>
        )}
      </Col>

      <CreateStageDialog
        nominationId={nomination.id}
        stages={stages}
        open={createOpen}
        onOpenChange={setCreateOpen}
        prefill={createPrefill}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Удалить этап «${deleteTarget?.title ?? ""}»?`}
        consequences="Отменить это действие нельзя. Сервер откажет, если в этапе уже начат бой или он служит источником другой ветки схемы."
        confirmLabel="Удалить"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
