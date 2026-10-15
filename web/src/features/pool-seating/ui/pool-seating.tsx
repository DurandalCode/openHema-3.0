"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListPlus, MapPin, Swords } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { filterChipVariants } from "@/shared/ui/filter-chip";
import { SkeletonCards } from "@/shared/ui/skeletons";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { poolStatusLabel, type Pool } from "@/entities/pool/lib/types";
import { groupBoutsByPool } from "@/entities/bout/lib/types";
import { usePoolsForArena } from "../api/use-pools-for-arena";
import { useSeatPool } from "../api/use-seat-pool";
import { useUnseatPool } from "../api/use-unseat-pool";
import { useEnqueuePool } from "../api/use-enqueue-pool";
import { useDequeuePool } from "../api/use-dequeue-pool";
import { useReorderArenaQueue } from "../api/use-reorder-arena-queue";
import { useSeatNextPool } from "../api/use-seat-next-pool";
import { useBoutsForNomination } from "../api/use-bouts-for-nomination";
import { ArenaQueue } from "./arena-queue";

const NOMINATIONS_HREF = "/admin/nominations";

/**
 * PoolSeating — секция постановки/снятия пула на странице конкретной арены
 * (спека 0011, FR-9): если пул сейчас на арене — его состав и бои по
 * порядку + кнопка «Снять»; если арена свободна — список готовых к
 * постановке пулов с кнопкой «Поставить» у каждого. Спека 0063: под этим —
 * очередь арены и «В очередь» у каждого доступного пула (на свободной арене
 * ещё и «Поставить следующий» у головы очереди).
 */
export function PoolSeating({ arenaId }: { arenaId: string }) {
  const { data, isLoading, error } = usePoolsForArena(arenaId);
  const unseat = useUnseatPool(arenaId);

  if (isLoading) {
    return <SkeletonCards count={2} />;
  }
  if (error instanceof UnauthorizedError) {
    // Спека 0039, FR-17/AC-12: сессия истекла — за происходящее отвечает
    // глобальный диалог «Сессия истекла», свой блок ошибки не рисуем.
    return null;
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Не удалось загрузить данные"}</AlertDescription>
      </Alert>
    );
  }

  const seatedPool = data.seated;

  return (
    <Col gap={4}>
      {unseat.error && (
        <Alert variant="destructive">
          <AlertDescription>{unseat.error.message}</AlertDescription>
        </Alert>
      )}
      {seatedPool && (
        <SeatedPoolCard
          pool={seatedPool}
          onUnseat={() => unseat.mutate(seatedPool.id)}
          unseatPending={unseat.isPending}
        />
      )}
      <QueuePlanning
        arenaId={arenaId}
        available={data.available}
        queued={data.queued ?? []}
        arenaFree={!seatedPool}
      />
    </Col>
  );
}

/**
 * ArenaQueueSection — очередь и добавление в очередь для арены, на которой
 * уже стоит пул (спека 0063, FR-7). Стоящий пул и его бои рисует сам экран
 * ведения, поэтому здесь только планирование: очередь, список доступных
 * пулов с «В очередь» и никакой постановки на занятую арену.
 */
export function ArenaQueueSection({ arenaId }: { arenaId: string }) {
  const { data, isLoading, error } = usePoolsForArena(arenaId);

  if (isLoading) {
    return <SkeletonCards count={1} />;
  }
  if (error instanceof UnauthorizedError) {
    return null;
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Не удалось загрузить данные"}</AlertDescription>
      </Alert>
    );
  }

  return (
    <QueuePlanning arenaId={arenaId} available={data.available} queued={data.queued ?? []} arenaFree={false} />
  );
}

/**
 * QueuePlanning — очередь арены + список доступных пулов (спека 0063).
 * `arenaFree` включает «Поставить» у пулов и «Поставить следующий» у головы
 * очереди; на занятой арене остаётся только «В очередь» (FR-7).
 */
function QueuePlanning({
  arenaId,
  available,
  queued,
  arenaFree,
}: {
  arenaId: string;
  available: Pool[];
  queued: Pool[];
  arenaFree: boolean;
}) {
  const seat = useSeatPool(arenaId);
  const enqueue = useEnqueuePool(arenaId);
  const dequeue = useDequeuePool(arenaId);
  const reorder = useReorderArenaQueue(arenaId);
  const seatNext = useSeatNextPool(arenaId);

  const mutationError =
    seat.error?.message ??
    enqueue.error?.message ??
    dequeue.error?.message ??
    reorder.error?.message ??
    seatNext.error?.message ??
    null;
  const queuePending = dequeue.isPending || reorder.isPending || seatNext.isPending;

  return (
    <Col gap={4}>
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}
      <ArenaQueue
        queued={queued}
        canSeatNext={arenaFree}
        onSeatNext={() => seatNext.mutate()}
        onReorder={(poolIds) => reorder.mutate(poolIds)}
        onRemove={(poolId) => dequeue.mutate(poolId)}
        pending={queuePending}
      />
      <AvailablePools
        pools={available}
        canSeat={arenaFree}
        hasQueue={queued.length > 0}
        onSeat={(poolId) => seat.mutate(poolId)}
        seatPending={seat.isPending}
        onEnqueue={(poolId) => enqueue.mutate(poolId)}
        enqueuePending={enqueue.isPending}
      />
    </Col>
  );
}

function SeatedPoolCard({
  pool,
  onUnseat,
  unseatPending,
}: {
  pool: Pool;
  onUnseat: () => void;
  unseatPending: boolean;
}) {
  const { data: bouts } = useBoutsForNomination(pool.nominationId);
  const boutsByPool = groupBoutsByPool(bouts ?? []);
  const poolBouts = boutsByPool[pool.id] ?? [];

  return (
    <Card>
      <CardContent className="pt-6">
        <Col gap={3}>
          <Row align="center" justify="between" gap={3} className="flex-wrap">
            <Row align="center" gap={2}>
              <span className="font-medium">{pool.name}</span>
              {pool.stageTitle && <Badge variant="outline">{pool.stageTitle}</Badge>}
              {pool.nominationName && (
                <Badge variant="outline">{pool.nominationName}</Badge>
              )}
              <Badge>готовится к запуску</Badge>
            </Row>
            <Button type="button" variant="outline" size="sm" onClick={onUnseat} loading={unseatPending}>
              Снять с арены
            </Button>
          </Row>
          <Col gap={1}>
            <span className="text-sm font-medium text-muted-foreground">Состав</span>
            <Col gap={1}>
              {pool.members.map((f) => (
                <Row key={f.fighterId} align="center" gap={2} className="text-sm">
                  <span>{f.name}</span>
                  {f.club && <span className="text-xs text-muted-foreground">({f.club})</span>}
                </Row>
              ))}
              {pool.members.length === 0 && (
                <p className="text-xs text-muted-foreground">Пусто</p>
              )}
            </Col>
          </Col>
          {poolBouts.length > 0 && (
            <Col gap={1} className="border-t pt-2">
              <Row align="center" gap={2} className="text-sm font-medium text-muted-foreground">
                <Swords className="size-4" />
                <span>Бои по порядку</span>
              </Row>
              <Col gap={1}>
                {poolBouts.map((bout) => (
                  <span key={bout.id} className="text-sm">
                    {bout.sequenceNumber}. {bout.fighterA.name} — {bout.fighterB.name}
                  </span>
                ))}
              </Col>
            </Col>
          )}
        </Col>
      </CardContent>
    </Card>
  );
}

/**
 * FilterChipButton — переключатель фильтра, поверх стилей
 * `FilterChip` (см. `features/admin/ui/users-filters.tsx` `RoleChip` — тот
 * же приём: `filterChipVariants` даёт тон, `aria-pressed` — настоящую
 * a11y-семантику переключателя, которой примитив `FilterChip` сам по себе
 * не отдаёт).
 */
function FilterChipButton({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(filterChipVariants({ tone: pressed ? "active" : "idle" }))}
    >
      <span>{label}</span>
    </button>
  );
}

/**
 * availableNominations — множество номинаций, у которых есть хотя бы один
 * готовый к постановке пул (спека 0033, FR-13): вычисляется из `pools`, не
 * хардкодится. Порядок — первое появление в списке (стабильный для чипов).
 */
function availableNominations(pools: Pool[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const pool of pools) {
    if (!pool.nominationId || seen.has(pool.nominationId)) continue;
    seen.set(pool.nominationId, pool.nominationName || pool.nominationId);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

function AvailablePools({
  pools,
  canSeat,
  hasQueue,
  onSeat,
  seatPending,
  onEnqueue,
  enqueuePending,
}: {
  pools: Pool[];
  /** canSeat — арена свободна: можно ставить сразу; иначе только в очередь. */
  canSeat: boolean;
  /** hasQueue — у арены уже есть очередь: пустой список доступных пулов не тупик. */
  hasQueue: boolean;
  onSeat: (poolId: string) => void;
  seatPending: boolean;
  onEnqueue: (poolId: string) => void;
  enqueuePending: boolean;
}) {
  const [selectedNominationId, setSelectedNominationId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<"unfinished" | "all" | "finished">("unfinished");

  const nominations = useMemo(() => availableNominations(pools), [pools]);
  const visiblePools = useMemo(
    () =>
      pools.filter((pool) => {
        if (selectedNominationId !== null && pool.nominationId !== selectedNominationId) return false;
        if (selectedStatus === "all") return true;
        const finished = pool.status === "POOL_STATUS_FINISHED";
        return selectedStatus === "finished" ? finished : !finished;
      }),
    [pools, selectedNominationId, selectedStatus],
  );

  if (pools.length === 0) {
    if (hasQueue) return null;
    return (
      <EmptyState
        title="Нет готовых пулов для постановки"
        hint="Пул появляется здесь, когда раскладка этапа зафиксирована — сначала нужно провести посев по группам."
      >
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={NOMINATIONS_HREF}>К посеву</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <Col gap={3}>
      <span className="text-sm text-muted-foreground">
        {canSeat
          ? "Арена свободна. Выберите готовый пул, чтобы поставить его на эту площадку или в её очередь."
          : "Арена занята. Добавьте пулы в очередь — они встанут после текущего."}
      </span>
      <div role="group" aria-label="Фильтр по номинации" className="flex flex-wrap gap-2">
        <FilterChipButton
          label="Все номинации"
          pressed={selectedNominationId === null}
          onClick={() => setSelectedNominationId(null)}
        />
        {nominations.map((n) => (
          <FilterChipButton
            key={n.id}
            label={n.name}
            pressed={selectedNominationId === n.id}
            onClick={() => setSelectedNominationId(n.id)}
          />
        ))}
      </div>
      <div role="group" aria-label="Фильтр по статусу пула" className="flex flex-wrap gap-2">
        <FilterChipButton
          label="Незавершённые"
          pressed={selectedStatus === "unfinished"}
          onClick={() => setSelectedStatus("unfinished")}
        />
        <FilterChipButton
          label="Все"
          pressed={selectedStatus === "all"}
          onClick={() => setSelectedStatus("all")}
        />
        <FilterChipButton
          label="Завершённые"
          pressed={selectedStatus === "finished"}
          onClick={() => setSelectedStatus("finished")}
        />
      </div>
      {visiblePools.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Нет пулов, подходящих под выбранные фильтры
        </p>
      )}
      {visiblePools.map((pool) => (
        <Card key={pool.id}>
          <CardContent className="pt-6">
            <Row align="center" justify="between" gap={3} className="flex-wrap">
              <Row align="center" gap={2} className="min-w-0 flex-wrap">
                <span className="min-w-0 break-words font-medium">{pool.name}</span>
                {pool.stageTitle && <Badge variant="outline">{pool.stageTitle}</Badge>}
                {pool.nominationName && (
                  <Badge variant="outline">{pool.nominationName}</Badge>
                )}
                <Badge variant="outline">{poolStatusLabel(pool.status)}</Badge>
                <Badge variant="secondary">{pool.members.length}</Badge>
                {pool.queueArenaName && (
                  <Badge variant="secondary">в очереди: {pool.queueArenaName}</Badge>
                )}
              </Row>
              <Row align="center" gap={2}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEnqueue(pool.id)}
                  loading={enqueuePending}
                >
                  <ListPlus /> В очередь
                </Button>
                {canSeat && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onSeat(pool.id)}
                    loading={seatPending}
                  >
                    <MapPin /> Поставить на эту арену
                  </Button>
                )}
              </Row>
            </Row>
          </CardContent>
        </Card>
      ))}
    </Col>
  );
}
