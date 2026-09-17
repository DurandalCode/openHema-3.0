"use client";

import { useState } from "react";
import { EmptyState } from "@/shared/ui/empty-state";
import { FilterChip } from "@/shared/ui/filter-chip";
import { Col } from "@/shared/ui/stack";
import type { LiveFeedBoutDto, LiveNominationDto } from "@/entities/tournament-live/lib/types";
import { filterFeed, sortFeed } from "@/entities/tournament-live/lib/feed";
import { BoutFeedRow } from "./bout-feed-row";

/**
 * BoutFeed — лента боёв дня (спека 0034, FR-15..FR-18): фильтр по номинации
 * — локальный `useState` (клиентский компонент), не перезапрашивает
 * страницу и не ходит в сеть (FR-18/AC-15): `bouts` уже пришли пропом,
 * фильтрация и сортировка — чистые функции `entities/tournament-live/lib/feed`.
 *
 * Список номинаций фильтра — только те, у которых в `bouts` есть хотя бы
 * один бой: черновые раскладки не попадают ни в ленту, ни в фильтр (AC-10) —
 * это уже гарантируется тем, что такие номинации не поставляют бои в
 * `bouts`, здесь просто не показываем для них пустой чип.
 */
export function BoutFeed({
  bouts,
  nominations,
}: {
  bouts: LiveFeedBoutDto[];
  nominations: LiveNominationDto[];
}) {
  const [filter, setFilter] = useState<string | null>(null);

  const nominationIdsWithBouts = new Set(bouts.map((b) => b.nominationId));
  const filterOptions = nominations.filter((n) => nominationIdsWithBouts.has(n.nominationId));
  const visible = sortFeed(filterFeed(bouts, filter));

  return (
    <section id="bout-feed" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-8">
      <Col gap={4}>
        <h2 className="text-xl font-semibold tracking-tight">Лента боёв</h2>

        {filterOptions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="Все номинации"
              tone={filter === null ? "active" : "idle"}
              dropdown={false}
              onClick={() => setFilter(null)}
            />
            {filterOptions.map((n) => (
              <FilterChip
                key={n.nominationId}
                label={n.title}
                tone={filter === n.nominationId ? "active" : "idle"}
                dropdown={false}
                onClick={() => setFilter(n.nominationId)}
              />
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          {visible.length === 0 ? (
            <EmptyState title="Боёв пока нет" />
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-normal">Время</th>
                  <th className="py-2 pr-4 font-normal">Площадка</th>
                  <th className="py-2 pr-4 font-normal">Пара</th>
                  <th className="py-2 pr-4 font-normal">Номинация</th>
                  <th className="py-2 pr-4 font-normal">Счёт</th>
                  <th className="py-2 pr-4 font-normal">Статус</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((bout) => (
                  <BoutFeedRow key={bout.boutId} bout={bout} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Время идущих и завершённых боёв — фактическое. Время предстоящих —
          ориентировочная оценка (спека 0043): порядок ведут секретари на
          площадках, точное время может отличаться.
        </p>
      </Col>
    </section>
  );
}
