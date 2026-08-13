"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/shared/ui/page-header";
import { Pagination } from "@/shared/ui/pagination";
import { clampPage, pageSlice } from "@/shared/lib/paginate";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { useApplicationsOverview } from "../api/use-applications-overview";
import { useConfirmPayment } from "../api/use-confirm-payment";
import { useRegisterFighter } from "../api/use-register-fighter";
import {
  filterApplications,
  overfullNominationIds as computeOverfullNominationIds,
  sortApplications,
  statusCounts,
} from "../lib/select-applications";
import { ApplicationCardDialog } from "./application-card-dialog";
import { ApplicationsFilters, nominationsCountWord } from "./applications-filters";
import { ApplicationsTable } from "./applications-table";

/** PAGE_SIZE — фиксированный размер клиентской страницы (spec FR-11). */
export const PAGE_SIZE = 20;

/**
 * applicationsCountWord — русское согласование числительного с «заявка»
 * (тот же приём, что `nominationsCountWord`, переиспользуемый отсюда же).
 */
function applicationsCountWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "заявок";
  const mod10 = n % 10;
  if (mod10 === 1) return "заявка";
  if (mod10 >= 2 && mod10 <= 4) return "заявки";
  return "заявок";
}

/**
 * ApplicationsScreen — корень экрана «Заявки» (spec FR-1…FR-26): очередь на
 * разбор таблицей, чипы статусов со счётчиками по всему турниру, выпадающий
 * список номинаций, поиск, клиентская пагинация, действия флоу с тостами
 * (успех/ошибка без «Повторить» — event-sourced заявка не идемпотентна,
 * spec FR-14), карточка заявки с историей.
 *
 * Владеет UI-состоянием (фильтры/поиск/страница/id открытой карточки) через
 * `useState` (ADR 0006 — некросскомпонентное состояние). Заголовок раздела —
 * `PageHeader` (spec FR-23), правило 0024 FR-19.
 */
export function ApplicationsScreen({
  tournamentId,
  nominations,
  tournamentName,
  initialNominationId,
}: {
  tournamentId: string;
  nominations: Nomination[];
  tournamentName?: string | null;
  initialNominationId?: string;
}) {
  const overviewQuery = useApplicationsOverview(tournamentId, {});
  const confirm = useConfirmPayment();
  const register = useRegisterFighter();

  const [statuses, setStatuses] = useState<Set<ApplicationState>>(new Set());
  const [nominationIds, setNominationIds] = useState<Set<string>>(
    () => new Set(initialNominationId ? [initialNominationId] : []),
  );
  const [needsEquipment, setNeedsEquipment] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null);

  const all = useMemo(() => overviewQuery.data ?? [], [overviewQuery.data]);
  // statusCounts не зависит от фильтров/поиска намеренно (FR-7/AC-2).
  const counts = useMemo(() => statusCounts(all), [all]);
  const overfull = useMemo(() => computeOverfullNominationIds(all, nominations), [all, nominations]);
  const filtered = useMemo(
    () => filterApplications(all, { statuses, nominationIds, needsEquipment, query }),
    [all, statuses, nominationIds, needsEquipment, query],
  );
  const sorted = useMemo(() => sortApplications(filtered), [filtered]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = clampPage(page, pageCount);
  const pageItems = pageSlice(sorted, currentPage, PAGE_SIZE);

  const openApplication = openApplicationId
    ? (all.find((a) => a.id === openApplicationId) ?? null)
    : null;

  const crumb = tournamentName ? `ЗАЯВКИ · ${tournamentName.toUpperCase()}` : "ЗАЯВКИ";
  const meta = `${all.length} ${applicationsCountWord(all.length)} · ${nominations.length} ${nominationsCountWord(nominations.length)}`;

  function resetFilters() {
    setStatuses(new Set());
    setNominationIds(new Set());
    setNeedsEquipment(false);
    setQuery("");
    setPage(1);
  }

  function onStatusesChange(next: Set<ApplicationState>) {
    setStatuses(next);
    setPage(1); // FR-11: смена фильтра возвращает на первую страницу.
  }

  function onNominationIdsChange(next: Set<string>) {
    setNominationIds(next);
    setPage(1);
  }

  function onNeedsEquipmentChange(value: boolean) {
    setNeedsEquipment(value);
    setPage(1);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function onConfirmPayment(applicationId: string) {
    confirm.mutate(applicationId, {
      onSuccess: () => toastSuccess("Оплата подтверждена"),
      onError: (err) => toastError(err.message),
    });
  }

  function onRegister(applicationId: string) {
    register.mutate(applicationId, {
      onSuccess: (res) => {
        toastSuccess(
          res.capacityExceeded
            ? "Боец зарегистрирован — номинация переполнена (лимит превышен)"
            : "Боец зарегистрирован",
        );
      },
      onError: (err) => toastError(err.message),
    });
  }

  return (
    <div data-slot="applications-screen" className="flex flex-col">
      <PageHeader crumb={crumb} title="Заявки" meta={meta} />

      <div className="flex flex-col gap-6 p-4">
        <ApplicationsFilters
          statuses={statuses}
          onStatusesChange={onStatusesChange}
          counts={counts}
          nominations={nominations}
          nominationIds={nominationIds}
          onNominationIdsChange={onNominationIdsChange}
          needsEquipment={needsEquipment}
          onNeedsEquipmentChange={onNeedsEquipmentChange}
          query={query}
          onQueryChange={onQueryChange}
          onReset={resetFilters}
        />

        <ApplicationsTable
          applications={pageItems}
          nominations={nominations}
          overfullNominationIds={overfull}
          isLoading={overviewQuery.isLoading}
          error={overviewQuery.error}
          onRetry={() => overviewQuery.refetch()}
          hasAnyApplications={all.length > 0}
          onOpenCard={setOpenApplicationId}
          onConfirmPayment={onConfirmPayment}
          onRegister={onRegister}
          confirmPendingId={confirm.isPending ? confirm.variables : null}
          registerPendingId={register.isPending ? register.variables : null}
        />

        {pageCount > 1 && (
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        )}
      </div>

      {openApplication && (
        <ApplicationCardDialog
          application={openApplication}
          nominations={nominations}
          overfullNominationIds={overfull}
          open={Boolean(openApplicationId)}
          onOpenChange={(next) => {
            if (!next) setOpenApplicationId(null);
          }}
        />
      )}
    </div>
  );
}
