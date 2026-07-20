import { MapPin } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import type { Pool } from "@/entities/pool/lib/types";
import type { Bout } from "@/entities/bout/lib/types";
import { groupBoutsByPool } from "@/entities/bout/lib/types";

/**
 * NominationPoolsPublic — публичные пулы готовой раскладки номинации: состав
 * (имена/клубы) и бои (пары + порядок, 0010); если пул поставлен на арену —
 * площадка и ярлык «готовится к запуску» (спека 0011, FR-11/FR-12/AC-12).
 * Read-only.
 *
 * `pools` пуст, пока раскладка номинации в `draft` (AC-14) — решает сервер
 * (`PoolPublicService.ListPublicPools`), здесь просто показывается сообщение.
 *
 * Server component: данные приходят через props из `getPublicPools()` /
 * `getPublicBouts()` (SSR).
 */
export function NominationPoolsPublic({ pools, bouts }: { pools: Pool[]; bouts: Bout[] }) {
  const boutsByPool = groupBoutsByPool(bouts);

  if (pools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Раскладка по группам ещё формируется — загляните позже.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pools.map((pool) => {
        const poolBouts = boutsByPool[pool.id] ?? [];
        const preparing = pool.status === "POOL_STATUS_PREPARING";
        return (
          <Card key={pool.id}>
            <CardHeader>
              <Col gap={2}>
                <Row align="center" justify="between" gap={2}>
                  <CardTitle className="text-base">{pool.name}</CardTitle>
                  <Badge variant="secondary">{pool.members.length}</Badge>
                </Row>
                {preparing && (
                  <Row align="center" gap={2} className="flex-wrap">
                    <Badge variant="outline" className="gap-1">
                      <MapPin className="size-3" />
                      {pool.arenaName || "—"}
                    </Badge>
                    <Badge>готовится к запуску</Badge>
                  </Row>
                )}
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
                {poolBouts.length > 0 && (
                  <Col gap={1} className="border-t pt-2">
                    <span className="text-xs font-medium text-muted-foreground">Бои</span>
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
      })}
    </div>
  );
}
