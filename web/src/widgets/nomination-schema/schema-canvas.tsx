"use client";

import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { groupStagesByLevel } from "@/entities/stage/lib/labels";
import type { StageTypeChoice } from "@/entities/stage/lib/schema-drag";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";
import { StageCard } from "./stage-card";

/**
 * CANVAS_EMPTY_ZONE_ID — id droppable-зоны броска на пустое место холста
 * (FR-13/FR-17): `data: { stageId: null }`, та же конвенция, что у карточек
 * (`stage-card.tsx`) — `onDragEnd` корня экрана читает `over.data.current`
 * без спец-случаев на тип узла.
 */
export const CANVAS_EMPTY_ZONE_ID = "canvas-empty-zone";

/**
 * SchemaCanvas — этапы по уровням (спека 0031, FR-8): `groupStagesByLevel`
 * (0019, FR-10) уже раскладывает этапы, здесь только подпись «Уровень N»
 * над каждым рядом и параллельные ветки рядом внутри ряда. Зона броска
 * (FR-13/FR-17/FR-30) — всегда внизу холста, не только когда схема пуста:
 * это одновременно постоянная droppable-цель для броска на «пустое место» и
 * пустое состояние схемы (AC-18 — заменяет прежнюю строку «Этапов ещё нет.»).
 */
export function SchemaCanvas({
  stages,
  issues,
  nominationId,
  onInspect,
  onDelete,
  onCreateStage,
}: {
  stages: Stage[];
  issues: SchemaIssue[];
  nominationId: string;
  onInspect: (stage: Stage) => void;
  onDelete: (stage: Stage) => void;
  onCreateStage: (type: StageTypeChoice) => void;
}) {
  const levels = groupStagesByLevel(stages);

  return (
    <Col gap={4} data-testid="schema-canvas">
      {levels.map((level, index) => (
        <Col key={`level-${index}`} gap={2} data-testid="schema-level">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Уровень {index + 1}
          </span>
          <Row gap={3} wrap align="start">
            {level.map((stage) => (
              <StageCard
                key={stage.id}
                stage={stage}
                stages={stages}
                nominationId={nominationId}
                issues={issues}
                onInspect={onInspect}
                onDelete={onDelete}
              />
            ))}
          </Row>
        </Col>
      ))}

      <EmptyDropZone onCreateStage={onCreateStage} />
    </Col>
  );
}

function EmptyDropZone({ onCreateStage }: { onCreateStage: (type: StageTypeChoice) => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: CANVAS_EMPTY_ZONE_ID,
    data: { stageId: null },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid="schema-canvas-empty-zone"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center transition-colors",
        isOver && "border-primary bg-accent",
      )}
    >
      <p className="text-sm text-muted-foreground">
        Перетащите сюда «Группы» или «Плейофф», чтобы создать этап
      </p>
      <Row gap={2}>
        <Button type="button" size="sm" variant="outline" onClick={() => onCreateStage("groups")}>
          + Группы
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onCreateStage("bracket")}>
          + Плейофф
        </Button>
      </Row>
    </div>
  );
}
