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
import { GripVertical, Plus, RotateCcw, Shuffle, Trash2, Undo2 } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import type { FighterRef, Pool, PoolLayout } from "@/entities/pool/lib/types";
import type { Bout } from "@/entities/bout/lib/types";
import { groupBoutsByPool } from "@/entities/bout/lib/types";
import { useLayout } from "../api/use-layout";
import { useCreatePool } from "../api/use-create-pool";
import { useDeletePool } from "../api/use-delete-pool";
import { useResetLayout } from "../api/use-reset-layout";
import { useAssignFighter } from "../api/use-assign-fighter";
import { useUnassignFighter } from "../api/use-unassign-fighter";
import { useAutoDistribute } from "../api/use-auto-distribute";
import { useUndo } from "../api/use-undo";
import { useSetLayoutStatus } from "../api/use-set-layout-status";
import { useBouts } from "../api/use-bouts";

const UNASSIGNED_ZONE = "zone:unassigned";
const poolZoneId = (poolId: string) => `zone:pool:${poolId}`;
const fighterDragId = (fighterId: string) => `fighter:${fighterId}`;

/**
 * NominationPools — экран управления составом номинации: нераспределённые
 * бойцы + пулы, drag & drop, автораспределение, undo, статус draft/ready
 * (спека 0009). В `ready` — read-only (FR-11).
 */
export function NominationPools({ nominationId }: { nominationId: string }) {
  const { data: layout, isLoading, error } = useLayout(nominationId);
  const createPool = useCreatePool(nominationId);
  const deletePool = useDeletePool(nominationId);
  const resetLayout = useResetLayout(nominationId);
  const assign = useAssignFighter(nominationId);
  const unassign = useUnassignFighter(nominationId);
  const autoDistribute = useAutoDistribute(nominationId);
  const undo = useUndo(nominationId);
  const setStatus = useSetLayoutStatus(nominationId);
  const { data: bouts } = useBouts(nominationId, layout?.status);

  const [draggingFighter, setDraggingFighter] = useState<FighterRef | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (error || !layout) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Не удалось загрузить раскладку"}</AlertDescription>
      </Alert>
    );
  }

  const readOnly = layout.status === "POOL_LAYOUT_STATUS_READY";
  const boutsByPool = groupBoutsByPool(bouts ?? []);
  const mutationError =
    createPool.error?.message ??
    deletePool.error?.message ??
    resetLayout.error?.message ??
    assign.error?.message ??
    unassign.error?.message ??
    autoDistribute.error?.message ??
    undo.error?.message ??
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
    const fromPoolId = (active.data.current?.fromPoolId as string | null | undefined) ?? null;
    const toPoolId = (over.data.current?.poolId as string | null | undefined) ?? null;
    if (!fighterId) return;

    if (toPoolId === fromPoolId) return; // тот же пул/те же нераспределённые — no-op

    if (toPoolId === null) {
      unassign.mutate(fighterId);
    } else {
      assign.mutate({ fighterId, poolId: toPoolId });
    }
  }

  return (
    <Col gap={6}>
      <Toolbar
        layout={layout}
        readOnly={readOnly}
        onCreatePool={() => createPool.mutate()}
        createPending={createPool.isPending}
        onAutoDistribute={() => autoDistribute.mutate()}
        autoDistributePending={autoDistribute.isPending}
        onUndo={() => undo.mutate()}
        undoPending={undo.isPending}
        onResetLayout={() => {
          if (window.confirm("Сбросить раскладку? Все пулы будут удалены, бойцы вернутся в нераспределённые."))
            resetLayout.mutate();
        }}
        resetPending={resetLayout.isPending}
        onToggleStatus={() => setStatus.mutate(readOnly ? "draft" : "ready")}
        statusPending={setStatus.isPending}
      />

      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          <UnassignedColumn fighters={layout.unassigned} readOnly={readOnly} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {layout.pools.map((pool) => (
              <PoolColumn
                key={pool.id}
                pool={pool}
                readOnly={readOnly}
                bouts={boutsByPool[pool.id] ?? []}
                onDelete={() => deletePool.mutate(pool.id)}
                deletePending={deletePool.isPending}
              />
            ))}
            {layout.pools.length === 0 && (
              <p className="text-sm text-muted-foreground">Пулы ещё не созданы.</p>
            )}
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

function Toolbar({
  layout,
  readOnly,
  onCreatePool,
  createPending,
  onAutoDistribute,
  autoDistributePending,
  onUndo,
  undoPending,
  onResetLayout,
  resetPending,
  onToggleStatus,
  statusPending,
}: {
  layout: PoolLayout;
  readOnly: boolean;
  onCreatePool: () => void;
  createPending: boolean;
  onAutoDistribute: () => void;
  autoDistributePending: boolean;
  onUndo: () => void;
  undoPending: boolean;
  onResetLayout: () => void;
  resetPending: boolean;
  onToggleStatus: () => void;
  statusPending: boolean;
}) {
  return (
    <Row align="center" justify="between" gap={3} className="flex-wrap">
      <Row align="center" gap={2} className="flex-wrap">
        <Badge variant={readOnly ? "default" : "secondary"}>
          {readOnly ? "готово" : "черновик"}
        </Badge>
        {!readOnly && (
          <>
            <Button type="button" size="sm" onClick={onCreatePool} loading={createPending}>
              <Plus /> Добавить группу
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAutoDistribute}
              loading={autoDistributePending}
            >
              <Shuffle /> Распределить по группам
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!layout.canUndo}
              onClick={onUndo}
              loading={undoPending}
            >
              <Undo2 /> Отменить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onResetLayout}
              loading={resetPending}
            >
              <RotateCcw /> Сбросить раскладку
            </Button>
          </>
        )}
      </Row>
      <Button type="button" size="sm" variant={readOnly ? "outline" : "default"} onClick={onToggleStatus} loading={statusPending}>
        {readOnly ? "Вернуть в черновик" : "Зафиксировать раскладку"}
      </Button>
    </Row>
  );
}

function UnassignedColumn({ fighters, readOnly }: { fighters: FighterRef[]; readOnly: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: UNASSIGNED_ZONE,
    data: { poolId: null },
    disabled: readOnly,
  });

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
                <FighterCard key={f.fighterId} fighter={f} fromPoolId={null} readOnly={readOnly} />
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

function PoolColumn({
  pool,
  readOnly,
  bouts,
  onDelete,
  deletePending,
}: {
  pool: Pool;
  readOnly: boolean;
  bouts: Bout[];
  onDelete: () => void;
  deletePending: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: poolZoneId(pool.id),
    data: { poolId: pool.id },
    disabled: readOnly,
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <Col gap={3}>
          <Row align="center" justify="between">
            <Row align="center" gap={2}>
              <span className="font-medium">{pool.name}</span>
              <Badge variant="secondary">{pool.members.length}</Badge>
            </Row>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                loading={deletePending}
                aria-label={`Удалить ${pool.name}`}
              >
                <Trash2 />
              </Button>
            )}
          </Row>
          <div
            ref={setNodeRef}
            className={cn(
              "min-h-24 rounded-md border border-dashed p-2 transition-colors",
              isOver && "border-primary bg-accent",
            )}
          >
            <Col gap={2}>
              {pool.members.map((f) => (
                <FighterCard key={f.fighterId} fighter={f} fromPoolId={pool.id} readOnly={readOnly} />
              ))}
              {pool.members.length === 0 && (
                <p className="text-xs text-muted-foreground">Пусто</p>
              )}
            </Col>
          </div>
          {readOnly && <BoutList bouts={bouts} />}
        </Col>
      </CardContent>
    </Card>
  );
}

/**
 * BoutList — бои пула, сформированные round-robin при фиксации раскладки
 * (спека 0010, AC-5): показываются только в `ready` (readOnly), исчезают
 * при возврате в `draft`. Порядок — `sequenceNumber` (FR-3a/FR-3b),
 * гарантирован `groupBoutsByPool`.
 */
function BoutList({ bouts }: { bouts: Bout[] }) {
  if (bouts.length === 0) return null;

  return (
    <Col gap={1} className="border-t pt-2">
      <span className="text-xs font-medium text-muted-foreground">Бои</span>
      <Col gap={1}>
        {bouts.map((bout) => (
          <span key={bout.id} className="text-xs">
            Бой {bout.sequenceNumber}: {bout.fighterA.name} — {bout.fighterB.name}
          </span>
        ))}
      </Col>
    </Col>
  );
}

function FighterCard({
  fighter,
  fromPoolId,
  readOnly,
}: {
  fighter: FighterRef;
  fromPoolId: string | null;
  readOnly: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: fighterDragId(fighter.fighterId),
    data: { fighterId: fighter.fighterId, fromPoolId, fighter },
    disabled: readOnly,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-md border bg-card px-2 py-1.5 text-sm transition-shadow",
        readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        // Во время drag оригинал скрыт (opacity-0) — видна только DragOverlay
        // (копия, следующая за курсором). Раньше opacity-40 давал фантомный
        // «гост», который маячил под overlay и создавал визуальный шум.
        isDragging && "opacity-0",
      )}
    >
      <FighterCardContent fighter={fighter} readOnly={readOnly} />
    </div>
  );
}

function FighterCardContent({ fighter, readOnly }: { fighter: FighterRef; readOnly?: boolean }) {
  return (
    <Row align="center" gap={2}>
      {!readOnly && <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />}
      <Col gap={0} className="min-w-0">
        <span className="truncate font-medium">{fighter.name}</span>
        {fighter.club && (
          <span className="truncate text-xs text-muted-foreground">{fighter.club}</span>
        )}
      </Col>
    </Row>
  );
}
