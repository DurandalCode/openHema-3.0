import { MapPin } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { poolStatusLabel, type PoolStatus } from "@/entities/pool/lib/types";
import { PoolStandingsTable } from "@/entities/pool/ui/pool-standings-table";
import type { LivePoolDto } from "@/entities/nomination-live/lib/types";
import { BoutRow } from "@/entities/pool/ui/bout-row";

/** poolStatusTone — статусный тон группы (дизайн-система 0022, тот же приём, что у половины сетки — `widgets/bracket-view`). */
function poolStatusTone(status: PoolStatus): "neutral" | "info" | "warn" | "live" | "success" {
  switch (status) {
    case "POOL_STATUS_READY":
      return "info";
    case "POOL_STATUS_PREPARING":
      return "warn";
    case "POOL_STATUS_ACTIVE":
      return "live";
    case "POOL_STATUS_FINISHED":
      return "success";
    default:
      return "neutral";
  }
}

/**
 * PoolCard — карточка группы на публичной странице номинации (спека 0035,
 * FR-10/FR-11/FR-12): название, число бойцов, площадка (или явная подпись
 * «площадка не назначена», AC-8, когда группе она не назначена — FR-11) и
 * исполнительный статус с живым маркером (AC-7). Три раздела — «Состав»,
 * «Бои» (через `BoutRow`), «Таблица» (`PoolStandingsTable`) — рендерятся,
 * только если для них есть данные, без пустых заголовков (FR-12). Принимает
 * весь `LivePoolDto` (пул + бои + текущий бой), как его уже собирает
 * снапшот номинации — извлечено из инлайновой карточки
 * `widgets/nomination-pools-public/nomination-pools-public.tsx`.
 */
export function PoolCard({ livePool }: { livePool: LivePoolDto }) {
  const { pool, bouts, currentBoutId } = livePool;
  return (
    <Card>
      <CardHeader>
        <Col gap={2}>
          <Row align="center" justify="between" gap={2}>
            <CardTitle className="text-base">{pool.name}</CardTitle>
            <Badge variant="secondary">{pool.members.length}</Badge>
          </Row>
          <Row align="center" gap={2} className="flex-wrap">
            {pool.arenaId ? (
              <Badge variant="outline" className="gap-1">
                <MapPin className="size-3" />
                {pool.arenaName || "—"}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">площадка не назначена</span>
            )}
            <Badge tone={poolStatusTone(pool.status)}>{poolStatusLabel(pool.status)}</Badge>
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
                  {f.club && <span className="text-xs text-muted-foreground">({f.club})</span>}
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
                {bouts.map((bout) => (
                  <BoutRow key={bout.id} bout={bout} isCurrent={bout.id === currentBoutId} />
                ))}
              </Col>
            </Col>
          )}
          <PoolStandingsTable standings={pool.standings} />
        </Col>
      </CardContent>
    </Card>
  );
}
