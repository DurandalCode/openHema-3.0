"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Archive, ExternalLink, MonitorPlay, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { TableRow } from "@/shared/ui/table-row";
import { cn } from "@/shared/lib/cn";
import { formatDurationLabel } from "@/entities/arena/lib/format";
import type { ArenaLiveStatusKind } from "@/entities/arena-live/lib/status";
import type { Arena } from "@/entities/arena/lib/types";
import type { ArenaBoardState } from "../api/use-arena-boards";

const DOT_TONE_CLASS: Record<ArenaLiveStatusKind, string> = {
  free: "bg-caption-foreground",
  preparing: "bg-[#a1650a] dark:bg-[#f0a04a]",
  bout: "bg-destructive",
  between: "bg-[#1749a8] dark:bg-[#6ea8fe]",
  finished: "bg-success",
  archived: "bg-caption-foreground",
  unknown: "bg-caption-foreground",
};

/**
 * StatusCell — ячейка «Состояние» (спека 0027, FR-3/FR-4/FR-10): индикатор
 * дублируется текстом (не только цветом/анимацией), пульсирует только
 * `kind === "bout"`, и только под `motion-safe:` — уважает системное
 * «уменьшить движение» (NFR-4) без правки `shared/ui/badge.tsx`.
 */
function StatusCell({
  isArchived,
  boardState,
}: {
  isArchived: boolean;
  boardState: ArenaBoardState | undefined;
}) {
  if (isArchived) {
    return <span className="text-sm text-caption-foreground">В архиве</span>;
  }
  if (!boardState) {
    return <span className="text-sm text-caption-foreground">—</span>;
  }
  if (boardState.isError) {
    return <span className="text-sm text-caption-foreground">статус недоступен</span>;
  }
  const { status } = boardState;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span
          aria-hidden
          data-slot="arena-status-dot"
          className={cn(
            "size-[9px] shrink-0 rounded-full",
            DOT_TONE_CLASS[status.kind],
            status.pulse && "motion-safe:animate-pulse",
          )}
        />
        {status.title}
      </span>
      {status.detail && (
        <span className="pl-[17px] text-xs text-caption-foreground">{status.detail}</span>
      )}
    </div>
  );
}

/**
 * ArenaRow — строка таблицы «Площадки» (spec FR-1..FR-5) на `TableRow`
 * (`cells`-API): порядок (стрелки + номер позиции), реквизиты, живой статус
 * (`StatusCell`), дефолтная длительность, действия. Строка **не**
 * кликабельна целиком (FR-19) — `TableRow` рендерится без `onClick`, все
 * действия — явные кнопки/ссылки.
 */
export function ArenaRow({
  arena,
  orderNumber,
  boardState,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  reorderPending,
  onEdit,
  onArchive,
  onRestore,
  archivePending,
  restorePending,
}: {
  arena: Arena;
  orderNumber: number;
  boardState: ArenaBoardState | undefined;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reorderPending: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  archivePending: boolean;
  restorePending: boolean;
}) {
  const isArchived = arena.status === "ARENA_STATUS_ARCHIVED";

  return (
    <TableRow
      state={isArchived ? "out" : "default"}
      cells={[
        {
          width: 56,
          node: isArchived ? (
            <span className="block text-center text-caption-foreground">·</span>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={isFirst || reorderPending}
                onClick={onMoveUp}
                aria-label="Переместить выше"
              >
                <ArrowUp />
              </Button>
              <span className="font-mono text-xs text-caption-foreground">{orderNumber}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={isLast || reorderPending}
                onClick={onMoveDown}
                aria-label="Переместить ниже"
              >
                <ArrowDown />
              </Button>
            </div>
          ),
        },
        {
          node: (
            <div className="flex flex-col gap-0.5">
              <span
                className={cn(
                  "text-sm font-semibold text-foreground",
                  isArchived && "line-through",
                )}
              >
                {arena.name || "—"}
              </span>
              {arena.description && (
                <span className="text-xs text-caption-foreground">{arena.description}</span>
              )}
            </div>
          ),
        },
        { width: 320, node: <StatusCell isArchived={isArchived} boardState={boardState} /> },
        {
          text: formatDurationLabel(arena.defaultDurationSeconds),
          mono: true,
          tone: "body",
          width: 80,
        },
        {
          width: 220,
          node: isArchived ? (
            <div className="flex justify-end">
              <Button type="button" variant="outline" loading={restorePending} onClick={onRestore}>
                <RotateCcw /> Восстановить
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <Button type="button" variant="ghost" size="icon-sm" asChild aria-label="Открыть площадку">
                <Link href={`/admin/arenas/${arena.id}`}>
                  <ExternalLink />
                </Link>
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" asChild aria-label="Открыть табло">
                <Link href={`/admin/arenas/${arena.id}/scoreboard`} target="_blank">
                  <MonitorPlay />
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onEdit}
                aria-label="Редактировать"
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                loading={archivePending}
                onClick={onArchive}
                aria-label="Убрать в архив"
              >
                <Archive />
              </Button>
            </div>
          ),
        },
      ]}
    />
  );
}
