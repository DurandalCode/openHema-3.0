"use client";

import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { SkeletonRows } from "@/shared/ui/skeletons";
import { TableHead, type TableHeadCol } from "@/shared/ui/table-head";
import { TableScroll } from "@/shared/ui/table-scroll";
import type { Nomination } from "@/entities/nomination/lib/types";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import type { NominationSchema } from "../api/use-nomination-schemas";
import { NominationRow } from "./nomination-row";

const COLUMNS: TableHeadCol[] = [
  { label: "Порядок", width: 56 },
  { label: "Номинация" },
  { label: "Приём", width: 140 },
  { label: "Схема", width: 260 },
  { label: "Бойцов", width: 90 },
  { label: "Действия", width: 56, align: "right" },
];

/**
 * NominationsTable — таблица «Номинации» (spec FR-1): владеет порядком
 * (FR-2) — сервер уже отдаёт список по позиции (0003), номер в колонке
 * «Порядок» — 1-based индекс строки. Скелетон при загрузке (FR-19), ошибка с
 * повтором (FR-19), одно пустое состояние — «номинаций ещё нет» (FR-20; в
 * отличие от 0027, второго пустого состояния нет — у номинации нет архива).
 */
export function NominationsTable({
  nominations,
  isLoading,
  error,
  onRetry,
  schemas,
  reorderPending,
  closePendingId,
  reopenPendingId,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  onCloseRegistration,
  onReopenRegistration,
}: {
  nominations: Nomination[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  schemas: Map<string, NominationSchema>;
  reorderPending: boolean;
  closePendingId: string | null;
  reopenPendingId: string | null;
  onMoveUp: (nominationId: string) => void;
  onMoveDown: (nominationId: string) => void;
  onEdit: (nominationId: string) => void;
  onDelete: (nominationId: string) => void;
  onCloseRegistration: (nominationId: string) => void;
  onReopenRegistration: (nominationId: string) => void;
}) {
  const showRows = !isLoading && !error && nominations.length > 0;

  return (
    <div data-slot="nominations-table" className="overflow-hidden rounded-lg border border-border">
      <TableScroll>
        <div className="min-w-[802px]">
          <TableHead cols={COLUMNS} />

          {showRows &&
            nominations.map((nomination, i) => (
              <NominationRow
                key={nomination.id}
                nomination={nomination}
                orderNumber={i + 1}
                isFirst={i === 0}
                isLast={i === nominations.length - 1}
                onMoveUp={() => onMoveUp(nomination.id)}
                onMoveDown={() => onMoveDown(nomination.id)}
                reorderPending={reorderPending}
                schema={schemas.get(nomination.id)}
                onEdit={() => onEdit(nomination.id)}
                onDelete={() => onDelete(nomination.id)}
                onCloseRegistration={() => onCloseRegistration(nomination.id)}
                onReopenRegistration={() => onReopenRegistration(nomination.id)}
                closePending={closePendingId === nomination.id}
                reopenPending={reopenPendingId === nomination.id}
              />
            ))}
        </div>
      </TableScroll>

      {isLoading ? (
        <SkeletonRows rows={5} cols={6} />
      ) : error instanceof UnauthorizedError ? null : error ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      ) : nominations.length === 0 ? (
        <EmptyState
          title="Номинаций ещё нет"
          hint="Заведите первую номинацию действием «+ Номинация»."
        />
      ) : null}
    </div>
  );
}
