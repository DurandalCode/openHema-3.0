"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/shared/ui/page-header";
import { Pagination } from "@/shared/ui/pagination";
import { clampPage } from "@/shared/lib/paginate";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { useApplicationsOverview } from "../api/use-applications-overview";
import { useConfirmPayment } from "../api/use-confirm-payment";
import { useRegisterFighter } from "../api/use-register-fighter";
import {
  overfullNominationIds as computeOverfullNominationIds,
  toStatusCountsRecord,
} from "../lib/select-applications";
import { ApplicationCardDialog } from "./application-card-dialog";
import { ApplicationsFilters, nominationsCountWord } from "./applications-filters";
import { ApplicationsTable } from "./applications-table";

/** PAGE_SIZE — размер серверной страницы (spec FR-11, 0041 FR-5). */
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
 * ApplicationsScreen — корень экрана «Заявки» (spec FR-1…FR-26, серверные
 * поиск/фильтр/постраничность — спека 0041): очередь на разбор таблицей,
 * чипы статусов со счётчиками по всему турниру, выпадающий список
 * номинаций, поиск, постраничная навигация, действия флоу с тостами
 * (успех/ошибка без «Повторить» — event-sourced заявка не идемпотентна,
 * spec FR-14), карточка заявки с историей.
 *
 * Фильтр/поиск/страница уходят параметрами в `useApplicationsOverview`
 * (сервер фильтрует, ищет и режет на страницы — спека 0041, FR-1..FR-6);
 * экран больше не держит полный список турнира в памяти. Счётчики статусов
 * (`counts`) и `totalCount`/число страниц приходят от сервера, не считаются
 * здесь. `overfullNominationIds` считается только по уже загруженной
 * СТРАНИЦЕ (см. `lib/select-applications.ts` — деградация задокументирована
 * там), не по всему турниру, как раньше, — полный список больше не
 * загружается на клиент (это и есть цель 0041/NFR-1).
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
  const [statuses, setStatuses] = useState<Set<ApplicationState>>(new Set());
  const [nominationIds, setNominationIds] = useState<Set<string>>(
    () => new Set(initialNominationId ? [initialNominationId] : []),
  );
  const [needsEquipment, setNeedsEquipment] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null);

  const overviewQuery = useApplicationsOverview(tournamentId, {
    statuses,
    nominationIds,
    needsEquipment,
    search: query,
    page,
    pageSize: PAGE_SIZE,
  });
  const confirm = useConfirmPayment();
  const register = useRegisterFighter();

  const applications = overviewQuery.applications;
  const totalCount = overviewQuery.totalCount;
  // statusCounts не зависит от фильтров/поиска намеренно (FR-7/AC-2) —
  // сервер уже считает их по всему турниру, здесь только смена формы.
  const counts = useMemo(() => toStatusCountsRecord(overviewQuery.statusCounts), [overviewQuery.statusCounts]);
  // hasAnyApplications различает два пустых состояния (FR-26): «заявок в
  // турнире нет вовсе» / «ничего не найдено по фильтру». totalCount — это
  // число заявок ПОД ФИЛЬТРОМ (FR-5), им нельзя пользоваться здесь; counts —
  // всегда по всему турниру (FR-4), сумма > 0 надёжно отвечает на вопрос
  // «есть ли в турнире хоть одна заявка», даже если сервер не прислал
  // явную нулевую запись для какого-то статуса (toStatusCountsRecord уже
  // подставила 0 по умолчанию).
  const hasAnyApplications = useMemo(
    () => Object.values(counts).some((c) => c > 0),
    [counts],
  );
  const overfull = useMemo(
    () => computeOverfullNominationIds(applications, nominations),
    [applications, nominations],
  );

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = clampPage(page, pageCount);

  const openApplication = openApplicationId
    ? (applications.find((a) => a.id === openApplicationId) ?? null)
    : null;

  const crumb = tournamentName ? `ЗАЯВКИ · ${tournamentName.toUpperCase()}` : "ЗАЯВКИ";
  const meta = `${totalCount} ${applicationsCountWord(totalCount)} · ${nominations.length} ${nominationsCountWord(nominations.length)}`;

  function resetFilters() {
    setStatuses(new Set());
    setNominationIds(new Set());
    setNeedsEquipment(false);
    setQuery("");
    setPage(1);
  }

  function onStatusesChange(next: Set<ApplicationState>) {
    setStatuses(next);
    setPage(1); // FR-11/FR-6 (0041): смена фильтра возвращает на первую страницу.
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
          applications={applications}
          nominations={nominations}
          overfullNominationIds={overfull}
          isLoading={overviewQuery.isLoading}
          error={overviewQuery.error}
          onRetry={() => overviewQuery.refetch()}
          hasAnyApplications={hasAnyApplications}
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
