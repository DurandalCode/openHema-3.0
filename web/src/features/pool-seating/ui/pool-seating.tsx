"use client";

import { MapPin, Swords } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import type { Pool } from "@/entities/pool/lib/types";
import { groupBoutsByPool } from "@/entities/bout/lib/types";
import { usePoolsForArena } from "../api/use-pools-for-arena";
import { useSeatPool } from "../api/use-seat-pool";
import { useUnseatPool } from "../api/use-unseat-pool";
import { useBoutsForNomination } from "../api/use-bouts-for-nomination";

/**
 * PoolSeating — секция постановки/снятия пула на странице конкретной арены
 * (спека 0011, FR-9): если пул сейчас на арене — его состав и бои по
 * порядку + кнопка «Снять»; если арена свободна — список готовых к
 * постановке пулов с кнопкой «Поставить» у каждого.
 */
export function PoolSeating({ arenaId }: { arenaId: string }) {
  const { data, isLoading, error } = usePoolsForArena(arenaId);
  const seat = useSeatPool(arenaId);
  const unseat = useUnseatPool(arenaId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Не удалось загрузить данные"}</AlertDescription>
      </Alert>
    );
  }

  const mutationError = seat.error?.message ?? unseat.error?.message ?? null;
  const seatedPool = data.seated;

  return (
    <Col gap={4}>
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}
      {seatedPool ? (
        <SeatedPoolCard
          pool={seatedPool}
          onUnseat={() => unseat.mutate(seatedPool.id)}
          unseatPending={unseat.isPending}
        />
      ) : (
        <AvailablePools
          pools={data.available}
          onSeat={(poolId) => seat.mutate(poolId)}
          seatPending={seat.isPending}
        />
      )}
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

function AvailablePools({
  pools,
  onSeat,
  seatPending,
}: {
  pools: Pool[];
  onSeat: (poolId: string) => void;
  seatPending: boolean;
}) {
  if (pools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Нет готовых пулов для постановки. Пул должен быть «готов» (раскладка
        номинации зафиксирована) и не стоять ни на одной арене.
      </p>
    );
  }

  return (
    <Col gap={3}>
      <span className="text-sm text-muted-foreground">
        Арена свободна. Выберите готовый пул, чтобы поставить его на эту площадку.
      </span>
      {pools.map((pool) => (
        <Card key={pool.id}>
          <CardContent className="pt-6">
            <Row align="center" justify="between" gap={3} className="flex-wrap">
              <Row align="center" gap={2}>
                <span className="font-medium">{pool.name}</span>
                <Badge variant="secondary">{pool.members.length}</Badge>
              </Row>
              <Button
                type="button"
                size="sm"
                onClick={() => onSeat(pool.id)}
                loading={seatPending}
              >
                <MapPin /> Поставить на эту арену
              </Button>
            </Row>
          </CardContent>
        </Card>
      ))}
    </Col>
  );
}
