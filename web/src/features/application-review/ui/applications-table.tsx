"use client";

import { useMemo } from "react";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { SkeletonRows } from "@/shared/ui/skeletons";
import { TableHead, type TableHeadCol } from "@/shared/ui/table-head";
import { TableScroll } from "@/shared/ui/table-scroll";
import type { Application } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { sortApplications } from "../lib/select-applications";
import { ApplicationRow } from "./application-row";

const COLUMNS: TableHeadCol[] = [
  { label: "Заявитель" },
  { label: "Номинация", width: 180 },
  { label: "Клуб", width: 180 },
  { label: "Статус", width: 220 },
  { label: "Действие", width: 200, align: "right" },
];

/**
 * ApplicationsTable — таблица «Заявки» (spec FR-1): шапка из пяти колонок,
 * строки в детерминированном порядке очереди `sortApplications` (FR-6) —
 * применяется здесь к уже отфильтрованной/найденной и постранично нарезанной
 * СЕРВЕРОМ странице (спека 0041, план «Web»), не ко всему списку турнира —
 * скелетон в форме таблицы при загрузке (FR-24), ошибка с повтором (FR-25),
 * два разных пустых состояния — заявок в турнире нет вовсе / ничего не
 * найдено по фильтрам (FR-26/AC-14).
 */
export function ApplicationsTable({
  applications,
  nominations,
  overfullNominationIds,
  isLoading,
  error,
  onRetry,
  hasAnyApplications,
  onOpenCard,
  onConfirmPayment,
  onRegister,
  confirmPendingId,
  registerPendingId,
  now,
}: {
  /** Страница, полученная от сервера (фильтр/поиск/срез уже применены — спека 0041); порядок отображения гарантируется этим компонентом. */
  applications: Application[];
  nominations: Nomination[];
  /** Множество переполненных номинаций (spec FR-4) — считается вызывающей стороной по текущей загруженной странице (спека 0041, см. `lib/select-applications.ts`). */
  overfullNominationIds: Set<string>;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Есть ли хоть одна заявка в турнире вообще (до фильтра/поиска) — различает два пустых состояния. */
  hasAnyApplications: boolean;
  onOpenCard: (applicationId: string) => void;
  onConfirmPayment?: (applicationId: string) => void;
  onRegister?: (applicationId: string) => void;
  confirmPendingId?: string | null;
  registerPendingId?: string | null;
  now?: Date;
}) {
  const nominationTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nominations) map.set(n.id, n.title);
    return map;
  }, [nominations]);

  const rows = sortApplications(applications);

  return (
    <div data-slot="applications-table" className="overflow-hidden rounded-lg border border-border">
      {isLoading ? (
        <>
          <TableHead cols={COLUMNS} />
          <SkeletonRows rows={6} cols={5} />
        </>
      ) : error instanceof UnauthorizedError ? null : error ? (
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
          {hasAnyApplications ? (
            <EmptyState
              title="По выбранным фильтрам ничего не найдено"
              hint="Попробуйте изменить фильтры или сбросить поиск."
            />
          ) : (
            <EmptyState title="Заявок в турнире нет" />
          )}
        </>
      ) : (
        <TableScroll>
          <div className="min-w-[980px]">
            <TableHead cols={COLUMNS} />
            {rows.map((app) => (
              <ApplicationRow
                key={app.id}
                application={app}
                nominationTitle={nominationTitleById.get(app.nominationId) ?? "—"}
                isOverfullNomination={overfullNominationIds.has(app.nominationId)}
                onOpenCard={onOpenCard}
                onConfirmPayment={onConfirmPayment}
                onRegister={onRegister}
                confirmPending={confirmPendingId === app.id}
                registerPending={registerPendingId === app.id}
                now={now}
              />
            ))}
          </div>
        </TableScroll>
      )}
    </div>
  );
}
