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
import { GripVertical, MoreVertical, RotateCcw, Shuffle, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Skeleton } from "@/shared/ui/skeleton";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { toastError, toastSuccess, toastUndo } from "@/shared/lib/toast";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import type { FighterRef, Pool, PoolLayout } from "@/entities/pool/lib/types";
import { PoolStandingsTable } from "@/entities/pool/ui/pool-standings-table";
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
import { useBouts } from "../api/use-bouts";

const UNASSIGNED_ZONE = "zone:unassigned";
const poolZoneId = (poolId: string) => `zone:pool:${poolId}`;
const fighterDragId = (fighterId: string) => `fighter:${fighterId}`;

/**
 * NominationPools — экран управления составом этапа: нераспределённые
 * бойцы + пулы, drag & drop, автораспределение, undo, статус draft/ready
 * (спека 0009). В `ready` — read-only (FR-11). Адресуется `stageId` (спека
 * 0018, FR-18); `nominationId` для боёв (`useBouts`, ручка не переехала на
 * этап) берётся из загруженной раскладки (`layout.stage.nominationId`).
 *
 * Обратная связь по мутациям — спека 0030: тосты вызываются здесь, в
 * компоненте (не внутри хуков — единообразно для всех шести мутаций и
 * тестируемо, т.к. `nomination-pools.test.tsx` мокает хуки целиком). Статус,
 * сводка распределения и кнопка фиксации переехали в `PageHeader` (спека
 * 0032, FR-3) — тулбар несёт только «+ Пул»/автораспределение/undo/сброс;
 * `readOnly` внутри компонента считается по-прежнему (гейтит DnD).
 * Удаление пула и автораспределение предлагают «Отменить» в тосте через
 * тот же общий undo-слот (0009, FR-7a), что и кнопка тулбара — без
 * ConfirmDialog (решение пользователя, spec «Решения по открытым
 * вопросам»). Постоянный баннер ошибки (`mutationError`) убран целиком.
 */
export function NominationPools({ stageId }: { stageId: string }) {
  const { data: layout, isLoading, error, refetch } = useLayout(stageId);
  const createPool = useCreatePool(stageId);
  const deletePool = useDeletePool(stageId);
  const resetLayout = useResetLayout(stageId);
  const assign = useAssignFighter(stageId);
  const unassign = useUnassignFighter(stageId);
  const autoDistribute = useAutoDistribute(stageId);
  const undo = useUndo(stageId);
  const { data: bouts } = useBouts(layout?.stage.nominationId ?? "", layout?.status);

  const [draggingFighter, setDraggingFighter] = useState<FighterRef | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  if (isLoading) {
    return <NominationPoolsSkeleton />;
  }
  if (error instanceof UnauthorizedError) {
    // Спека 0039, FR-18/AC-12: сессия истекла — за происходящее отвечает
    // глобальный диалог «Сессия истекла», свой блок ошибки не рисуем.
    return null;
  }
  if (error || !layout) {
    return (
      <Col gap={3} className="items-start">
        <p className="text-sm text-destructive">
          {error?.message ?? "Не удалось загрузить раскладку"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          Повторить
        </Button>
      </Col>
    );
  }

  const readOnly = layout.status === "POOL_LAYOUT_STATUS_READY";
  const boutsByPool = groupBoutsByPool(bouts ?? []);

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

    const onDndError = (err: Error) => toastError(err.message);
    if (toPoolId === null) {
      unassign.mutate(fighterId, { onError: onDndError });
    } else {
      assign.mutate({ fighterId, poolId: toPoolId }, { onError: onDndError });
    }
  }

  /**
   * Клавиатурный путь к переносу (спека 0039, FR-21/FR-24): та же мутация,
   * что и `onDragEnd`, вызванная из пункта меню «Переместить» карточки
   * бойца. В отличие от тихого DnD, успех объявляется тостом — меню не
   * оставляет визуального следа переноса (нет `DragOverlay`), поэтому
   * программе чтения с экрана и глазом нужен явный отчёт о результате
   * (FR-24, AC-14).
   */
  function handleMenuAssign(fighter: FighterRef, pool: Pool) {
    assign.mutate(
      { fighterId: fighter.fighterId, poolId: pool.id },
      {
        onSuccess: () => toastSuccess(`${fighter.name} → ${pool.name}`),
        onError: (err: Error) => toastError(err.message),
      },
    );
  }

  function handleMenuUnassign(fighter: FighterRef) {
    unassign.mutate(fighter.fighterId, {
      onSuccess: () => toastSuccess(`${fighter.name} → Нераспределённые`),
      onError: (err: Error) => toastError(err.message),
    });
  }

  function handleCreatePool() {
    createPool.mutate(undefined, {
      onSuccess: () => toastSuccess("Пул создан"),
      onError: (err: Error) => toastError(err.message),
    });
  }

  /**
   * Удаление пула — сразу, без `ConfirmDialog` (спека 0030, FR-4): покрыто
   * общим undo-слотом (0009, FR-7a), тот же приём, что архивация площадки
   * в 0027. Тост «Отменить» зовёт тот же `undo`, что и кнопка тулбара.
   */
  function handleDeletePool(pool: Pool) {
    deletePool.mutate(pool.id, {
      onSuccess: () => toastUndo("Пул удалён", { onUndo: () => undo.mutate() }),
      onError: (err: Error) => toastError(err.message),
    });
  }

  function handleAutoDistribute() {
    autoDistribute.mutate(undefined, {
      onSuccess: () => toastUndo("Раскладка обновлена", { onUndo: () => undo.mutate() }),
      onError: (err: Error) => toastError(err.message),
    });
  }

  function handleUndo() {
    undo.mutate(undefined, { onError: (err: Error) => toastError(err.message) });
  }

  /**
   * Сброс раскладки покрыт отменой последнего действия (undo), поэтому
   * подтверждение — без ввода названия (0023, FR-8); успех/ошибка идут через
   * тост, а не через постоянный inline-баннер (0023, FR-6). Единственная
   * мутация экрана, оставшаяся с `ConfirmDialog` — блэст-радиус в разы
   * больше единичных действий (весь состав раскладки разом, spec FR-6).
   */
  function handleResetConfirm() {
    resetLayout.mutate(undefined, {
      onSuccess: () => {
        toastUndo("Раскладка сброшена", { onUndo: () => undo.mutate() });
      },
      onError: (err: Error) => {
        toastError(err.message, { retry: handleResetConfirm });
      },
    });
  }

  return (
    <Col gap={6}>
      <Toolbar
        layout={layout}
        readOnly={readOnly}
        onCreatePool={handleCreatePool}
        createPending={createPool.isPending}
        onAutoDistribute={handleAutoDistribute}
        autoDistributePending={autoDistribute.isPending}
        onUndo={handleUndo}
        undoPending={undo.isPending}
        onResetLayout={() => setConfirmResetOpen(true)}
        resetPending={resetLayout.isPending}
      />

      {/* Подпись этапа над составом групп (спека 0017, FR-11, AC-3). */}
      <h2 className="text-sm font-medium text-muted-foreground">{layout.stage.title}</h2>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
          <UnassignedColumn
            fighters={layout.unassigned}
            pools={layout.pools}
            readOnly={readOnly}
            onAssign={handleMenuAssign}
            onUnassign={handleMenuUnassign}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {layout.pools.map((pool) => (
              <PoolColumn
                key={pool.id}
                pool={pool}
                pools={layout.pools}
                readOnly={readOnly}
                bouts={boutsByPool[pool.id] ?? []}
                onDelete={() => handleDeletePool(pool)}
                deletePending={deletePool.isPending}
                onAssign={handleMenuAssign}
                onUnassign={handleMenuUnassign}
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

      <ConfirmDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="Сбросить раскладку?"
        consequences="Все пулы будут удалены, бойцы вернутся в нераспределённые."
        confirmLabel="Сбросить"
        destructive
        onConfirm={handleResetConfirm}
      />
    </Col>
  );
}

/** NominationPoolsSkeleton — скелетон в форме раскладки: колонка + сетка карточек (спека 0030, FR-11). */
function NominationPoolsSkeleton() {
  return (
    <div
      data-testid="nomination-pools-skeleton"
      className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]"
    >
      <Card>
        <CardContent className="pt-6">
          <Col gap={3}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full" />
          </Col>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Col gap={3}>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-24 w-full" />
              </Col>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
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
}) {
  if (readOnly) return null;

  return (
    <Row align="center" gap={2} className="flex-wrap">
      <Button type="button" size="sm" onClick={onCreatePool} loading={createPending}>
        + Пул
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onAutoDistribute}
        loading={autoDistributePending}
      >
        <Shuffle /> Распределить автоматически
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
      <Button type="button" size="sm" variant="outline" onClick={onResetLayout} loading={resetPending}>
        <RotateCcw /> Сбросить раскладку
      </Button>
    </Row>
  );
}

function UnassignedColumn({
  fighters,
  pools,
  readOnly,
  onAssign,
  onUnassign,
}: {
  fighters: FighterRef[];
  pools: Pool[];
  readOnly: boolean;
  onAssign: (fighter: FighterRef, pool: Pool) => void;
  onUnassign: (fighter: FighterRef) => void;
}) {
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
                <FighterCard
                  key={f.fighterId}
                  fighter={f}
                  fromPoolId={null}
                  pools={pools}
                  readOnly={readOnly}
                  onAssign={onAssign}
                  onUnassign={onUnassign}
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

function PoolColumn({
  pool,
  pools,
  readOnly,
  bouts,
  onDelete,
  deletePending,
  onAssign,
  onUnassign,
}: {
  pool: Pool;
  pools: Pool[];
  readOnly: boolean;
  bouts: Bout[];
  onDelete: () => void;
  deletePending: boolean;
  onAssign: (fighter: FighterRef, pool: Pool) => void;
  onUnassign: (fighter: FighterRef) => void;
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
            <Row align="center" gap={2} className="flex-wrap">
              <span className="font-medium">{pool.name}</span>
              <Badge variant="secondary">{pool.members.length}</Badge>
              {pool.status === "POOL_STATUS_PREPARING" && (
                <Badge title={pool.arenaName ? `Площадка: ${pool.arenaName}` : undefined}>
                  готовится к запуску
                </Badge>
              )}
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
                <FighterCard
                  key={f.fighterId}
                  fighter={f}
                  fromPoolId={pool.id}
                  pools={pools}
                  readOnly={readOnly}
                  onAssign={onAssign}
                  onUnassign={onUnassign}
                />
              ))}
              {pool.members.length === 0 && (
                <p className="text-xs text-muted-foreground">Перетащите бойца сюда</p>
              )}
            </Col>
          </div>
          {readOnly && (
            <>
              <BoutList bouts={bouts} />
              <PoolStandingsTable standings={pool.standings} />
            </>
          )}
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
  pools,
  readOnly,
  onAssign,
  onUnassign,
}: {
  fighter: FighterRef;
  fromPoolId: string | null;
  pools: Pool[];
  readOnly: boolean;
  onAssign: (fighter: FighterRef, pool: Pool) => void;
  onUnassign: (fighter: FighterRef) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: fighterDragId(fighter.fighterId),
    data: { fighterId: fighter.fighterId, fromPoolId, fighter },
    disabled: readOnly,
  });

  const otherPools = pools.filter((p) => p.id !== fromPoolId);

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border bg-card px-2 py-1.5 text-sm transition-shadow",
        // Во время drag оригинал скрыт (opacity-0) — видна только DragOverlay
        // (копия, следующая за курсором). Раньше opacity-40 давал фантомный
        // «гост», который маячил под overlay и создавал визуальный шум.
        isDragging && "opacity-0",
      )}
    >
      {/*
        Drag-ref и меню-кнопка — раздельные узлы (по образцу `SlotBox` из
        `bracket-seeding`): drag-слушатели `useDraggable` не должны глотать
        pointer-события клика по кнопке меню — карточка перестаёт «дёргаться»
        от клика по «Переместить».
      */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className={cn("min-w-0 flex-1", readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing")}
      >
        <FighterCardContent fighter={fighter} readOnly={readOnly} />
      </div>
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Переместить ${fighter.name}`}
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {otherPools.map((pool) => (
              <DropdownMenuItem key={pool.id} onSelect={() => onAssign(fighter, pool)}>
                В {pool.name}
              </DropdownMenuItem>
            ))}
            {fromPoolId !== null && (
              <>
                {otherPools.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onSelect={() => onUnassign(fighter)}>
                  В нераспределённые
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
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
