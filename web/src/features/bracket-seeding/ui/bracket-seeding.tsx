"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical, RotateCcw, Undo2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import type { FighterRef } from "@/entities/pool/lib/types";
import type { BracketHalf, BracketPair, BracketSlot } from "@/entities/bracket/lib/types";
import { BracketView } from "@/widgets/bracket-view/bracket-view";
import { useBracket } from "../api/use-bracket";
import { useSeedSlot } from "../api/use-seed-slot";
import { useClearSlot } from "../api/use-clear-slot";
import { useResetBracket } from "../api/use-reset-bracket";
import { useUndoBracket } from "../api/use-undo-bracket";
import { useSetBracketStatus } from "../api/use-set-bracket-status";
import { resolveDrop } from "../lib/drop-action";

const UNASSIGNED_ZONE = "zone:unassigned";
const slotZoneId = (slot: number) => `zone:slot:${slot}`;
const fighterDragId = (fighterId: string, slot: number | null) =>
  `fighter:${slot ?? "u"}:${fighterId || "empty"}`;

/**
 * BracketSeeding — ручной посев первого круга сетки (спека 0018, FR-7/FR-8):
 * слева нераспределённые бойцы, справа пары первого круга по половинам, DnD
 * на `@dnd-kit` по образцу `features/nomination-pools`. После фиксации —
 * read-only `widgets/bracket-view` (FR-19).
 */
export function BracketSeeding({ stageId }: { stageId: string }) {
  const { data: bracket, isLoading, error } = useBracket(stageId);
  const seedSlot = useSeedSlot(stageId);
  const clearSlot = useClearSlot(stageId);
  const resetBracket = useResetBracket(stageId);
  const undoBracket = useUndoBracket(stageId);
  const setStatus = useSetBracketStatus(stageId);

  const [draggingFighter, setDraggingFighter] = useState<FighterRef | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (error || !bracket) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Не удалось загрузить сетку"}</AlertDescription>
      </Alert>
    );
  }

  const readOnly = bracket.stage.status === "POOL_LAYOUT_STATUS_READY";
  const mutationError =
    seedSlot.error?.message ??
    clearSlot.error?.message ??
    resetBracket.error?.message ??
    undoBracket.error?.message ??
    setStatus.error?.message ??
    null;

  function onDragStart(event: DragStartEvent) {
    const fighter = event.active.data.current?.fighter as FighterRef | undefined;
    setDraggingFighter(fighter ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingFighter(null);
    const { active, over } = event;
    if (!over) return;

    const fighterId = active.data.current?.fighterId as string | undefined;
    const fromSlot = (active.data.current?.fromSlot as number | null | undefined) ?? null;
    const toSlot = (over.data.current?.slot as number | null | undefined) ?? null;
    const action = resolveDrop(fighterId, fromSlot, toSlot);

    if (action.type === "seed") seedSlot.mutate({ fighterId: action.fighterId, slot: action.slot });
    if (action.type === "clear") clearSlot.mutate(action.slot);
  }

  if (readOnly) {
    return (
      <Col gap={6}>
        <Row align="center" justify="between" gap={3} className="flex-wrap">
          <Badge>готово</Badge>
          <Row gap={2} className="flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!bracket.canUndo}
              onClick={() => undoBracket.mutate()}
              loading={undoBracket.isPending}
            >
              <Undo2 /> Отменить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStatus.mutate("draft")}
              loading={setStatus.isPending}
            >
              Вернуть в черновик
            </Button>
          </Row>
        </Row>

        {mutationError && (
          <Alert variant="destructive">
            <AlertDescription>{mutationError}</AlertDescription>
          </Alert>
        )}

        <BracketView bracket={bracket} />
      </Col>
    );
  }

  const round = bracket.rounds[0];

  return (
    <Col gap={6}>
      <Row align="center" justify="between" gap={3} className="flex-wrap">
        <Badge variant="secondary">черновик</Badge>
        <Row gap={2} className="flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!bracket.canUndo}
            onClick={() => undoBracket.mutate()}
            loading={undoBracket.isPending}
          >
            <Undo2 /> Отменить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm("Сбросить посев целиком? Все слоты будут очищены."))
                resetBracket.mutate();
            }}
            loading={resetBracket.isPending}
          >
            <RotateCcw /> Сбросить посев
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setStatus.mutate("ready")}
            loading={setStatus.isPending}
          >
            Зафиксировать сетку
          </Button>
        </Row>
      </Row>

      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          <UnassignedColumn fighters={bracket.unassigned} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {round?.halves.map((half) => (
              <HalfColumn
                key={half.half}
                half={half}
                onClearSlot={(slot) => clearSlot.mutate(slot)}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingFighter && (
            <div className="rounded-md border bg-card px-2 py-1.5 text-sm shadow-lg">
              <FighterCardContent fighter={draggingFighter} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </Col>
  );
}

function UnassignedColumn({ fighters }: { fighters: FighterRef[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED_ZONE, data: { slot: null } });

  return (
    <Card>
      <CardContent className="pt-6">
        <Col gap={3}>
          <Row align="center" justify="between">
            <span className="font-medium">Нераспределённые</span>
            <Badge variant="secondary">{fighters.length}</Badge>
          </Row>
          <div
            ref={setNodeRef}
            className={cn(
              "min-h-24 rounded-md border border-dashed p-2 transition-colors",
              isOver && "border-primary bg-accent",
            )}
          >
            <Col gap={2}>
              {fighters.map((f) => (
                <UnassignedFighterCard key={f.fighterId} fighter={f} />
              ))}
              {fighters.length === 0 && (
                <p className="text-xs text-muted-foreground">Пусто</p>
              )}
            </Col>
          </div>
        </Col>
      </CardContent>
    </Card>
  );
}

function UnassignedFighterCard({ fighter }: { fighter: FighterRef }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: fighterDragId(fighter.fighterId, null),
    data: { fighterId: fighter.fighterId, fromSlot: null, fighter },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-md border bg-card px-2 py-1.5 text-sm transition-shadow active:cursor-grabbing",
        isDragging && "opacity-0",
      )}
    >
      <FighterCardContent fighter={fighter} />
    </div>
  );
}

function HalfColumn({
  half,
  onClearSlot,
}: {
  half: BracketHalf;
  onClearSlot: (slot: number) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Col gap={3}>
          <span className="font-medium">{half.title || half.container.name}</span>
          <Col gap={3}>
            {half.pairs.map((pair) => (
              <PairSlots key={pair.index} pair={pair} onClearSlot={onClearSlot} />
            ))}
          </Col>
        </Col>
      </CardContent>
    </Card>
  );
}

function PairSlots({
  pair,
  onClearSlot,
}: {
  pair: BracketPair;
  onClearSlot: (slot: number) => void;
}) {
  return (
    <Col gap={1} className="rounded-md border p-2">
      <SlotBox slot={pair.slotA} onClear={onClearSlot} />
      <SlotBox slot={pair.slotB} onClear={onClearSlot} />
    </Col>
  );
}

function SlotBox({ slot, onClear }: { slot: BracketSlot; onClear: (slot: number) => void }) {
  const filled = slot.state === "BRACKET_SLOT_STATE_FILLED";
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: slotZoneId(slot.slot),
    data: { slot: slot.slot },
  });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: fighterDragId(slot.fighter.fighterId, slot.slot),
    data: { fighterId: slot.fighter.fighterId, fromSlot: slot.slot, fighter: slot.fighter },
    disabled: !filled,
  });

  return (
    <div
      ref={setDropRef}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border border-dashed p-2 text-sm transition-colors",
        isOver && "border-primary bg-accent",
        filled && "border-solid bg-card",
      )}
    >
      {filled ? (
        <>
          <div
            ref={setDragRef}
            {...listeners}
            {...attributes}
            className={cn(
              "flex flex-1 cursor-grab items-center gap-2 active:cursor-grabbing",
              isDragging && "opacity-0",
            )}
          >
            <FighterCardContent fighter={slot.fighter} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Освободить слот ${slot.slot}`}
            onClick={() => onClear(slot.slot)}
          >
            <X />
          </Button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Слот {slot.slot} — пусто</span>
      )}
    </div>
  );
}

function FighterCardContent({ fighter }: { fighter: FighterRef }) {
  return (
    <Row align="center" gap={2}>
      <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
      <Col gap={0} className="min-w-0">
        <span className="truncate font-medium">{fighter.name}</span>
        {fighter.club && (
          <span className="truncate text-xs text-muted-foreground">{fighter.club}</span>
        )}
      </Col>
    </Row>
  );
}
