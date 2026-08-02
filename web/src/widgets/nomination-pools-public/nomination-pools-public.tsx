"use client";

import { MapPin } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { poolStatusLabel, boutStateLabel, outcomeOf } from "@/entities/pool/lib/types";
import type { BoardBout } from "@/entities/pool/lib/types";
import { PoolStandingsTable } from "@/entities/pool/ui/pool-standings-table";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import { useNominationLive } from "@/features/nomination-live/api/use-nomination-live";

/** outcomeLabel — исход завершённого боя (спека 0013, FR-3) как текст. */
function outcomeLabel(bout: BoardBout): string {
  const outcome = outcomeOf(bout.scoreA, bout.scoreB);
  if (outcome === "draw") return "ничья";
  return outcome === "A" ? bout.fighterA.name : bout.fighterB.name;
}

/**
 * NominationPoolsPublic — публичный «живой» экран пулов номинации (спека
 * 0014): состав (имена/клубы), исполнительный статус пула
 * (готовится/идёт/завершён), площадка, и для каждого боя — пара, состояние,
 * счёт `A:B`, исход завершённого, подсветка текущего боя. Read-only.
 *
 * `snapshot.pools` пуст, пока раскладка номинации в `draft` (FR-12) — решает
 * сервер (`StagePublicService`), здесь просто показывается сообщение.
 *
 * Client-компонент: засеян SSR-снапшотом (`initialSnapshot`) и подписан на
 * живой канал через `useNominationLive` (SSE + polling-fallback, спека 0014).
 */
export function NominationPoolsPublic({
  nominationId,
  initialSnapshot,
}: {
  nominationId: string;
  initialSnapshot: NominationLiveSnapshotDto;
}) {
  const snapshot = useNominationLive(nominationId, initialSnapshot);
  const { pools } = snapshot;

  if (pools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Раскладка по группам ещё формируется — загляните позже.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pools.map((livePool) => {
        const { pool, bouts, currentBoutId } = livePool;
        return (
          <Card key={pool.id}>
            <CardHeader>
              <Col gap={2}>
                <Row align="center" justify="between" gap={2}>
                  <CardTitle className="text-base">{pool.name}</CardTitle>
                  <Badge variant="secondary">{pool.members.length}</Badge>
                </Row>
                <Row align="center" gap={2} className="flex-wrap">
                  {pool.arenaId && (
                    <Badge variant="outline" className="gap-1">
                      <MapPin className="size-3" />
                      {pool.arenaName || "—"}
                    </Badge>
                  )}
                  <Badge>{poolStatusLabel(pool.status)}</Badge>
                </Row>
              </Col>
            </CardHeader>
            <CardContent>
              <Col gap={3}>
                <Col gap={1}>
                  <span className="text-xs font-medium text-muted-foreground">Состав</span>
                  <Col gap={1}>
                    {pool.members.map((f) => (
                      <Row key={f.fighterId} align="center" gap={2} className="text-sm">
                        <span>{f.name}</span>
                        {f.club && (
                          <span className="text-xs text-muted-foreground">({f.club})</span>
                        )}
                      </Row>
                    ))}
                    {pool.members.length === 0 && (
                      <p className="text-xs text-muted-foreground">Пусто</p>
                    )}
                  </Col>
                </Col>
                {bouts.length > 0 && (
                  <Col gap={1} className="border-t pt-2">
                    <span className="text-xs font-medium text-muted-foreground">Бои</span>
                    <Col gap={1}>
                      {bouts.map((bout) => {
                        const isCurrent = bout.id === currentBoutId;
                        const finished = bout.state === "BOUT_STATE_FINISHED";
                        return (
                          <Col
                            key={bout.id}
                            gap={1}
                            className={cn(
                              "rounded-md px-1.5 py-1",
                              isCurrent && "outline outline-2 outline-primary",
                            )}
                            data-current={isCurrent || undefined}
                          >
                            <Row align="center" justify="between" gap={2} className="flex-wrap">
                              <span className="text-sm">
                                {bout.sequenceNumber}. {bout.fighterA.name} — {bout.fighterB.name}
                              </span>
                              <Row align="center" gap={2}>
                                <span className="text-sm font-medium tabular-nums">
                                  {bout.scoreA}:{bout.scoreB}
                                </span>
                                <Badge variant={isCurrent ? "default" : "outline"}>
                                  {boutStateLabel(bout.state)}
                                </Badge>
                              </Row>
                            </Row>
                            {finished && (
                              <span className="text-xs text-muted-foreground">
                                Исход: {outcomeLabel(bout)}
                              </span>
                            )}
                          </Col>
                        );
                      })}
                    </Col>
                  </Col>
                )}
                <PoolStandingsTable standings={pool.standings} />
              </Col>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
