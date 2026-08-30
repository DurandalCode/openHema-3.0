"use client";

import { useMemo } from "react";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { SkeletonRows } from "@/shared/ui/skeletons";
import { TableHead, type TableHeadCol } from "@/shared/ui/table-head";
import { TableScroll } from "@/shared/ui/table-scroll";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { sortFighters } from "../lib/select-fighters";
import { FighterRow } from "./fighter-row";

const COLUMNS: TableHeadCol[] = [
  { label: "Боец" },
  { label: "Клуб", width: 180 },
  { label: "Участие в номинациях" },
  { label: "Статус", width: 140 },
  { label: "Происхождение", width: 200 },
];

/**
 * FightersTable — таблица «Бойцы» (spec FR-1): шапка из пяти колонок,
 * строки в детерминированном порядке `sortFighters` (FR-6), скелетон в
 * форме таблицы при загрузке (FR-24), ошибка с повтором (FR-24), два разных
 * пустых состояния — бойцов в ростере нет вовсе / ничего не найдено по
 * фильтрам (FR-25/AC-16).
 */
export function FightersTable({
  fighters,
  nominations,
  isLoading,
  error,
  onRetry,
  hasAnyFighters,
  onOpenCard,
}: {
  /** Уже отфильтрованная/нарезанная по странице выборка — порядок гарантируется этим компонентом. */
  fighters: Fighter[];
  nominations: Nomination[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Есть ли хоть один боец в ростере вообще (до фильтра/поиска) — различает два пустых состояния. */
  hasAnyFighters: boolean;
  onOpenCard: (fighterId: string) => void;
}) {
  const nominationTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nominations) map.set(n.id, n.title);
    return map;
  }, [nominations]);

  const rows = sortFighters(fighters);
  const head = <TableHead cols={COLUMNS} />;

  return (
    <div data-slot="fighters-table" className="overflow-hidden rounded-lg border border-border">
      {isLoading ? (
        <>
          {head}
          <SkeletonRows rows={6} cols={5} />
        </>
      ) : error instanceof UnauthorizedError ? null : error ? (
        <>
          {head}
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Повторить
            </Button>
          </div>
        </>
      ) : rows.length === 0 ? (
        <>
          {head}
          {hasAnyFighters ? (
            <EmptyState
              title="По выбранным фильтрам никого не найдено"
              hint="Попробуйте изменить фильтры или сбросить поиск."
            />
          ) : (
            <EmptyState
              title="В ростере пока нет бойцов"
              hint="Боец появляется из регистрации заявки либо заводится вручную."
            />
          )}
        </>
      ) : (
        // Шапка и строки скроллятся вбок вместе (spec 0044, FR-8/AC-3): у
        // «Клуб»/«Статус»/«Происхождение» фиксированная ширина (180+140+200),
        // у «Боец»/«Участие в номинациях» — гибкая, с запасом на длинные
        // значения. min-w форсирует горизонтальный скролл только тогда, когда
        // реально есть строки данных — skeleton/error/empty не нуждаются в
        // принудительной ширине.
        <TableScroll>
          <div className="min-w-[920px]">
            {head}
            {rows.map((f) => (
              <FighterRow key={f.id} fighter={f} nominationTitleById={nominationTitleById} onOpenCard={onOpenCard} />
            ))}
          </div>
        </TableScroll>
      )}
    </div>
  );
}
