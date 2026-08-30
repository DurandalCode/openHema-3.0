"use client";

import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { SkeletonRows } from "@/shared/ui/skeletons";
import { TableHead, type TableHeadCol } from "@/shared/ui/table-head";
import { TableScroll } from "@/shared/ui/table-scroll";
import type { Arena } from "@/entities/arena/lib/types";
import type { ArenaBoardState } from "../api/use-arena-boards";
import { ArenaRow } from "./arena-row";

const COLUMNS: TableHeadCol[] = [
  { label: "Порядок", width: 56 },
  { label: "Площадка" },
  { label: "Состояние", width: 320 },
  { label: "Длительность", width: 80 },
  { label: "Действия", width: 220 },
];

/**
 * ArenasTable — таблица «Площадки» (spec FR-1): владеет порядком (FR-2) —
 * активные по позиции, затем архивные (когда показаны) тоже по позиции;
 * номер в колонке «Порядок» — 1-based индекс среди активных, а не
 * `arena.position` напрямую (тот общий для всего набора площадок турнира,
 * включая скрытые архивные, и не совпадал бы с видимым порядком строк).
 * Скелетон при загрузке (FR-21), ошибка с повтором (FR-21), два разных
 * пустых состояния — площадок нет вовсе / все в архиве (FR-22/AC-14).
 */
export function ArenasTable({
  arenas,
  showArchived,
  isLoading,
  error,
  onRetry,
  boardStates,
  reorderPending,
  archivePendingId,
  restorePendingId,
  onMoveUp,
  onMoveDown,
  onEdit,
  onArchive,
  onRestore,
}: {
  /** Полный список площадок турнира (сервер уже отдаёт по позиции). */
  arenas: Arena[];
  showArchived: boolean;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  boardStates: Map<string, ArenaBoardState>;
  reorderPending: boolean;
  archivePendingId: string | null;
  restorePendingId: string | null;
  onMoveUp: (arenaId: string) => void;
  onMoveDown: (arenaId: string) => void;
  onEdit: (arenaId: string) => void;
  onArchive: (arenaId: string) => void;
  onRestore: (arenaId: string) => void;
}) {
  const active = arenas.filter((a) => a.status !== "ARENA_STATUS_ARCHIVED");
  const archived = showArchived
    ? arenas.filter((a) => a.status === "ARENA_STATUS_ARCHIVED")
    : [];
  const rows = [...active, ...archived];
  const hasAnyArenas = arenas.length > 0;

  return (
    <div data-slot="arenas-table" className="overflow-hidden rounded-lg border border-border">
      {isLoading ? (
        <>
          <TableHead cols={COLUMNS} />
          <SkeletonRows rows={5} cols={5} />
        </>
      ) : error ? (
        <>
          <TableHead cols={COLUMNS} />
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Повторить
            </Button>
          </div>
        </>
      ) : rows.length === 0 ? (
        <>
          <TableHead cols={COLUMNS} />
          {hasAnyArenas ? (
            <EmptyState
              title="Все площадки в архиве"
              hint="Включите показ архивных, чтобы их увидеть."
            />
          ) : (
            <EmptyState
              title="Площадок ещё нет"
              hint="Заведите первую площадку действием «+ Площадка»."
            />
          )}
        </>
      ) : (
        <TableScroll>
          <div className="min-w-[880px]">
            <TableHead cols={COLUMNS} />
            {rows.map((arena) => {
              const activeIndex = active.findIndex((a) => a.id === arena.id);
              return (
                <ArenaRow
                  key={arena.id}
                  arena={arena}
                  orderNumber={activeIndex + 1}
                  boardState={boardStates.get(arena.id)}
                  isFirst={activeIndex === 0}
                  isLast={activeIndex === active.length - 1}
                  onMoveUp={() => onMoveUp(arena.id)}
                  onMoveDown={() => onMoveDown(arena.id)}
                  reorderPending={reorderPending}
                  onEdit={() => onEdit(arena.id)}
                  onArchive={() => onArchive(arena.id)}
                  onRestore={() => onRestore(arena.id)}
                  archivePending={archivePendingId === arena.id}
                  restorePending={restorePendingId === arena.id}
                />
              );
            })}
          </div>
        </TableScroll>
      )}
    </div>
  );
}
