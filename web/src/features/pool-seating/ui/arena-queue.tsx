"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { poolTitle, type Pool } from "@/entities/pool/lib/types";
import { groupBoutsByPool } from "@/entities/bout/lib/types";
import { useBoutsForNomination } from "../api/use-bouts-for-nomination";

/** boutCountLabel — «1 бой», «2 боя», «5 боёв». */
function boutCountLabel(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} боёв`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n} бой`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} боя`;
  return `${n} боёв`;
}

/**
 * ArenaQueue — очередь пулов арены по порядку (спека 0063, FR-16): номер,
 * пул, этап, номинация, число боёв; «вверх/вниз» и «убрать из очереди». У
 * свободной арены (`canSeatNext`) над списком — первый пул и действие
 * «Поставить следующий» (FR-9). Переход к следующему пулу — только это
 * явное действие, автоматики нет (FR-8).
 *
 * Презентационный компонент: мутации и их ошибки живут в `PoolSeating`.
 */
export function ArenaQueue({
  queued,
  canSeatNext,
  onSeatNext,
  onReorder,
  onRemove,
  pending,
}: {
  queued: Pool[];
  canSeatNext: boolean;
  onSeatNext: () => void;
  /** onReorder получает полный новый порядок id (контракт ReorderArenaQueue). */
  onReorder: (poolIds: string[]) => void;
  onRemove: (poolId: string) => void;
  pending: boolean;
}) {
  function move(index: number, delta: -1 | 1) {
    const ids = queued.map((p) => p.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    onReorder(ids);
  }

  const head = queued[0];

  return (
    <Col gap={3}>
      <span className="text-sm font-medium text-muted-foreground">Очередь арены</span>
      {head && canSeatNext && (
        <Row align="center" justify="between" gap={3} className="flex-wrap">
          <span className="min-w-0 break-words text-sm">Следующий: {poolTitle(head)}</span>
          <Button type="button" size="sm" onClick={onSeatNext} loading={pending}>
            Поставить следующий
          </Button>
        </Row>
      )}
      {queued.length === 0 ? (
        <p className="text-sm text-muted-foreground">Очередь пуста</p>
      ) : (
        <ol className="flex list-none flex-col gap-2 p-0">
          {queued.map((pool, index) => (
            <QueueItem
              key={pool.id}
              pool={pool}
              position={index + 1}
              isFirst={index === 0}
              isLast={index === queued.length - 1}
              pending={pending}
              onUp={() => move(index, -1)}
              onDown={() => move(index, 1)}
              onRemove={() => onRemove(pool.id)}
            />
          ))}
        </ol>
      )}
    </Col>
  );
}

function QueueItem({
  pool,
  position,
  isFirst,
  isLast,
  pending,
  onUp,
  onDown,
  onRemove,
}: {
  pool: Pool;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  // Бои всех пулов номинации приходят одним списком; запрос общий (RQ
  // дедуплицирует по nominationId), поэтому строка очереди не плодит запросы.
  const { data: bouts } = useBoutsForNomination(pool.nominationId);
  const boutCount = (groupBoutsByPool(bouts ?? [])[pool.id] ?? []).length;
  const title = poolTitle(pool);

  return (
    <li>
      <Card>
        <CardContent className="py-3">
          <Row align="center" justify="between" gap={3} className="flex-wrap">
            <Row align="center" gap={2} className="min-w-0 flex-wrap">
              <Badge variant="secondary">{position}</Badge>
              <span className="min-w-0 break-words font-medium">{pool.name}</span>
              {pool.stageTitle && <Badge variant="outline">{pool.stageTitle}</Badge>}
              {pool.nominationName && <Badge variant="outline">{pool.nominationName}</Badge>}
              {boutCount > 0 && (
                <span className="text-xs text-muted-foreground">{boutCountLabel(boutCount)}</span>
              )}
            </Row>
            <Row align="center" gap={1}>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Выше: ${title}`}
                disabled={isFirst || pending}
                onClick={onUp}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Ниже: ${title}`}
                disabled={isLast || pending}
                onClick={onDown}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Убрать из очереди: ${title}`}
                disabled={pending}
                onClick={onRemove}
              >
                <X />
              </Button>
            </Row>
          </Row>
        </CardContent>
      </Card>
    </li>
  );
}
