"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Col, Row } from "@/shared/ui/stack";
import { defaultPoolTab, type PoolTab } from "@/entities/pool/lib/pool-tab";
import type { BoardBout, FighterRef, PoolStanding, PoolStatus } from "@/entities/pool/lib/types";
import { BoutRow } from "@/entities/pool/ui/bout-row";
import { PoolStandingsTable } from "@/entities/pool/ui/pool-standings-table";

/**
 * PoolResultsTabs — вкладки «Бои / Рейтинг» карточки группы (спека 0061).
 * Одно представление за раз вместо длинной ленты «бои + таблица».
 *
 * Начальная вкладка — `defaultPoolTab(status)`: «Бои» только у идущей группы
 * (FR-4). Пока пользователь вкладку не выбирал, она следует за живым статусом
 * (FR-4a); после первого выбора — остаётся его выбором, живые обновления её не
 * сбрасывают. Состояние локально для карточки и между перезагрузками не
 * хранится. Компонент ничего не запрашивает: все данные приходят из живого
 * снапшота родителя (NFR-1).
 *
 * «Рейтинг» без итогов показывает состав группы вместо пустой таблицы
 * (FR-3a, 0016 FR-7) — отдельный «Состав» в карточке не нужен (FR-3b).
 *
 * Живёт в `entities/pool/ui`: общий для admin-фичи и public-виджета, как
 * `BoutRow` и `PoolStandingsTable`.
 */
export function PoolResultsTabs({
  status,
  members,
  standings,
  bouts,
  currentBoutId,
}: {
  status: PoolStatus;
  members: FighterRef[];
  standings: PoolStanding[];
  bouts: BoardBout[];
  currentBoutId: string;
}) {
  const [chosen, setChosen] = useState<PoolTab | null>(null);
  const active = chosen ?? defaultPoolTab(status);

  return (
    <Tabs value={active} onValueChange={(v) => setChosen(v as PoolTab)}>
      <TabsList>
        <TabsTrigger value="bouts">Бои · {bouts.length}</TabsTrigger>
        <TabsTrigger value="standings">Рейтинг</TabsTrigger>
      </TabsList>
      <TabsContent value="bouts">
        <Col gap={1}>
          {bouts.map((bout) => (
            <BoutRow key={bout.id} bout={bout} isCurrent={bout.id === currentBoutId} />
          ))}
        </Col>
      </TabsContent>
      <TabsContent value="standings">
        {standings.length > 0 ? (
          <PoolStandingsTable standings={standings} />
        ) : (
          <Col gap={2}>
            <p className="text-xs text-muted-foreground">Итогов пока нет</p>
            <Col gap={1}>
              {members.map((f) => (
                <Row key={f.fighterId} align="center" gap={2} className="text-sm">
                  <span>{f.name}</span>
                  {f.club && <span className="text-xs text-muted-foreground">({f.club})</span>}
                </Row>
              ))}
            </Col>
          </Col>
        )}
      </TabsContent>
    </Tabs>
  );
}
