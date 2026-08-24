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
import { GripVertical, MoreVertical, RotateCcw, Undo2, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Skeleton } from "@/shared/ui/skeleton";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { toastError, toastSuccess, toastUndo } from "@/shared/lib/toast";
import type { FighterRef } from "@/entities/pool/lib/types";
import type { BracketHalf, BracketPair, BracketSlot } from "@/entities/bracket/lib/types";
import { BracketView } from "@/widgets/bracket-view/bracket-view";
import { useBracket } from "../api/use-bracket";
import { useSeedSlot } from "../api/use-seed-slot";
import { useClearSlot } from "../api/use-clear-slot";
import { useResetBracket } from "../api/use-reset-bracket";
import { useUndoBracket } from "../api/use-undo-bracket";
import { bracketErrorMessage } from "../api/errors";
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
 *
 * Обратная связь по мутациям — спека 0032, FR-21/FR-22 (по образцу 0030):
 * постоянный inline-баннер (`mutationError`) убран целиком, все отказы идут
 * тостом через `bracketErrorMessage` (санкционированный дубль
 * `nomination-pools/api/errors.ts`, правило 6 `web/AGENTS.md`). DnD и
 * тулбарная «Отменить» — тихий успех, тост только на ошибку; сброс —
 * тост-успех/`toastUndo`. Статус этапа и переключатель фиксации ушли из
 * тулбара в `PageHeader` страницы этапа (спека 0032, FR-3) — их здесь
 * больше нет, `readOnly` вычисляется локально и только гейтит DnD/действия.
 */
export function BracketSeeding({ stageId }: { stageId: string }) {
  const { data: bracket, isLoading, error, refetch } = useBracket(stageId);
  const seedSlot = useSeedSlot(stageId);
  const clearSlot = useClearSlot(stageId);
  const resetBracket = useResetBracket(stageId);
  const undoBracket = useUndoBracket(stageId);

  const [draggingFighter, setDraggingFighter] = useState<FighterRef | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  if (isLoading) {
    return <BracketSeedingSkeleton />;
  }
  if (error || !bracket) {
    return (
      <Col gap={3} className="items-start">
        <p className="text-sm text-destructive">
          {error?.message ?? "Не удалось загрузить сетку"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          Повторить
        </Button>
      </Col>
    );
  }

  const readOnly = bracket.stage.status === "POOL_LAYOUT_STATUS_READY";

  function handleSeedSlot(fighterId: string, slot: number) {
    seedSlot.mutate(
      { fighterId, slot },
      { onError: (err: Error) => toastError(bracketErrorMessage(err.message)) },
    );
  }

  /**
   * Клавиатурный путь к посеву (спека 0039, FR-22/FR-24): та же мутация
   * `seedSlot`, что и `onDragEnd`/`handleSeedSlot`, вызванная из меню
   * «Поставить в слот»/«Переместить в слот». В отличие от тихого DnD, здесь
   * нет `DragOverlay`, поэтому успех объявляется тостом (AC-14) — DnD
   * (FR-25, AC-16) не трогаем, у него по-прежнему тихий успех.
   */
  function handleMenuSeedSlot(fighter: FighterRef, slot: number) {
    seedSlot.mutate(
      { fighterId: fighter.fighterId, slot },
      {
        onSuccess: () => toastSuccess(`${fighter.name} → слот ${slot}`),
        onError: (err: Error) => toastError(bracketErrorMessage(err.message)),
      },
    );
  }

  function handleClearSlot(slot: number) {
    clearSlot.mutate(slot, {
      onError: (err: Error) => toastError(bracketErrorMessage(err.message)),
    });
  }

  function handleUndo() {
    undoBracket.mutate(undefined, {
      onError: (err: Error) => toastError(bracketErrorMessage(err.message)),
    });
  }

  /**
   * Сброс посева покрыт отменой последнего действия (undo), поэтому
   * подтверждение — без ввода названия (FR-8); успех/ошибка идут через
   * тост, а не через постоянный inline-баннер (спека 0032, FR-21/FR-22).
   */
  function handleResetConfirm() {
    resetBracket.mutate(undefined, {
      onSuccess: () => {
        toastUndo("Посев сброшен", { onUndo: () => undoBracket.mutate() });
      },
      onError: (err: Error) => {
        toastError(bracketErrorMessage(err.message), { retry: handleResetConfirm });
      },
    });
  }

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

    if (action.type === "seed") handleSeedSlot(action.fighterId, action.slot);
    if (action.type === "clear") handleClearSlot(action.slot);
  }

  if (readOnly) {
    return (
      <Col gap={6}>
        <Row justify="end" gap={2} className="flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!bracket.canUndo}
            onClick={handleUndo}
            loading={undoBracket.isPending}
          >
            <Undo2 /> Отменить
          </Button>
        </Row>

        <BracketView bracket={bracket} />
      </Col>
    );
  }

  const round = bracket.rounds[0];
  /**
   * Пустые слоты обеих половин первого круга — варианты меню «Поставить в
   * слот»/«Переместить в слот» (спека 0039, FR-22, AC-15). Заполненные слоты
   * исключены — туда сажает только обмен (server-side), не отдельный пункт
   * меню (см. `resolveDrop`/`useSeedSlot`).
   */
  const emptySlots = (round?.halves.flatMap((h) => h.pairs.flatMap((p) => [p.slotA, p.slotB])) ?? [])
    .filter((s) => s.state !== "BRACKET_SLOT_STATE_FILLED")
    .map((s) => s.slot)
    .sort((a, b) => a - b);

  return (
    <Col gap={6}>
      <Row justify="end" gap={2} className="flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!bracket.canUndo}
          onClick={handleUndo}
          loading={undoBracket.isPending}
        >
          <Undo2 /> Отменить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirmResetOpen(true)}
          loading={resetBracket.isPending}
        >
          <RotateCcw /> Сбросить посев
        </Button>
      </Row>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          <UnassignedColumn
            fighters={bracket.unassigned}
            emptySlots={emptySlots}
            onSeedSlot={handleMenuSeedSlot}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {round?.halves.map((half) => (
              <HalfColumn
                key={half.half}
                half={half}
                onClearSlot={handleClearSlot}
                emptySlots={emptySlots}
                onSeedSlot={handleMenuSeedSlot}
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

      <ConfirmDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="Сбросить посев?"
        consequences="Все слоты будут очищены."
        confirmLabel="Сбросить"
        destructive
        onConfirm={handleResetConfirm}
      />
    </Col>
  );
}

/**
 * BracketSeedingSkeleton — скелетон в форме экрана посева: нераспределённые
 * + пары первого круга по половинам (спека 0032, FR-23), а не общие
 * карточки-заглушки (`SkeletonCards`).
 */
function BracketSeedingSkeleton() {
  return (
    <div
      data-testid="bracket-seeding-skeleton"
      className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]"
    >
      <Card>
        <CardContent className="pt-6">
          <Col gap={3}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full" />
          </Col>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Col gap={3}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </Col>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UnassignedColumn({
  fighters,
  emptySlots,
  onSeedSlot,
}: {
  fighters: FighterRef[];
  emptySlots: number[];
  onSeedSlot: (fighter: FighterRef, slot: number) => void;
}) {
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
                <UnassignedFighterCard
                  key={f.fighterId}
                  fighter={f}
                  emptySlots={emptySlots}
                  onSeedSlot={onSeedSlot}
                />
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

function UnassignedFighterCard({
  fighter,
  emptySlots,
  onSeedSlot,
}: {
  fighter: FighterRef;
  emptySlots: number[];
  onSeedSlot: (fighter: FighterRef, slot: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: fighterDragId(fighter.fighterId, null),
    data: { fighterId: fighter.fighterId, fromSlot: null, fighter },
  });

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border bg-card px-2 py-1.5 text-sm transition-shadow",
        isDragging && "opacity-0",
      )}
    >
      {/* Drag-ref и меню-кнопка — раздельные узлы (см. `SlotBox`): drag не
          должен перехватывать клик по «Поставить в слот». */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="min-w-0 flex-1 cursor-grab active:cursor-grabbing"
      >
        <FighterCardContent fighter={fighter} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Поставить ${fighter.name} в слот`}
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {emptySlots.length === 0 && <DropdownMenuItem disabled>Нет свободных слотов</DropdownMenuItem>}
          {emptySlots.map((slot) => (
            <DropdownMenuItem key={slot} onSelect={() => onSeedSlot(fighter, slot)}>
              В слот {slot}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function HalfColumn({
  half,
  onClearSlot,
  emptySlots,
  onSeedSlot,
}: {
  half: BracketHalf;
  onClearSlot: (slot: number) => void;
  emptySlots: number[];
  onSeedSlot: (fighter: FighterRef, slot: number) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Col gap={3}>
          <span className="font-medium">{half.title || half.container.name}</span>
          <Col gap={3}>
            {half.pairs.map((pair) => (
              <PairSlots
                key={pair.index}
                pair={pair}
                onClearSlot={onClearSlot}
                emptySlots={emptySlots}
                onSeedSlot={onSeedSlot}
              />
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
  emptySlots,
  onSeedSlot,
}: {
  pair: BracketPair;
  onClearSlot: (slot: number) => void;
  emptySlots: number[];
  onSeedSlot: (fighter: FighterRef, slot: number) => void;
}) {
  return (
    <Col gap={1} className="rounded-md border p-2">
      <SlotBox slot={pair.slotA} onClear={onClearSlot} emptySlots={emptySlots} onSeedSlot={onSeedSlot} />
      <SlotBox slot={pair.slotB} onClear={onClearSlot} emptySlots={emptySlots} onSeedSlot={onSeedSlot} />
    </Col>
  );
}

function SlotBox({
  slot,
  onClear,
  emptySlots,
  onSeedSlot,
}: {
  slot: BracketSlot;
  onClear: (slot: number) => void;
  emptySlots: number[];
  onSeedSlot: (fighter: FighterRef, slot: number) => void;
}) {
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
          {/*
            Опциональная (T11) клавиатурная перестановка уже посеянного
            бойца в другой пустой слот — та же мутация `seedSlot`, что и
            перетаскивание между слотами (сервер сам освобождает исходный
            слот, см. `useSeedSlot`/`resolveDrop`). Скрыта, когда свободных
            слотов нет.
          */}
          {emptySlots.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Переместить ${slot.fighter.name} в другой слот`}
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {emptySlots.map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => onSeedSlot(slot.fighter, s)}>
                    В слот {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
        <span className="text-xs text-muted-foreground">Перетащите бойца сюда</span>
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
