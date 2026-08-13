"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";
import { Pagination } from "@/shared/ui/pagination";
import { clampPage, pageSlice } from "@/shared/lib/paginate";
import { toastSuccess } from "@/shared/lib/toast";
import type { Fighter, FighterStatus } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { useRoster } from "../api/use-roster";
import { clubOptions, filterFighters, sortFighters, statusCounts } from "../lib/select-fighters";
import { CreateFighterDialog } from "./create-fighter-dialog";
import { FighterCardDialog } from "./fighter-card-dialog";
import { countWord, FightersFilters } from "./fighters-filters";
import { FightersTable } from "./fighters-table";

/** PAGE_SIZE — фиксированный размер клиентской страницы (spec FR-11). */
export const PAGE_SIZE = 20;

function fightersCountWord(n: number): string {
  return countWord(n, ["боец", "бойца", "бойцов"]);
}

function nominationsCountWord(n: number): string {
  return countWord(n, ["номинация", "номинации", "номинаций"]);
}

/**
 * FightersScreen — корень экрана «Бойцы» (spec FR-1…FR-25): ростер
 * таблицей с детерминированным порядком, чипы статусов со счётчиками по
 * всему ростеру, выпадающие фильтры номинации/клуба, поиск, клиентская
 * пагинация, карточка бойца (перевод/вывод/возврат/правка/участия) и
 * модалка ручного заведения из шапки раздела.
 *
 * Владеет UI-состоянием (фильтры/поиск/страница/id открытой карточки/
 * открытость модалки создания) через `useState` (ADR 0006). Заголовок
 * раздела — `PageHeader` (spec FR-23), правило 0024 FR-19.
 */
export function FightersScreen({
  tournamentId,
  nominations,
  tournamentName,
}: {
  tournamentId: string;
  nominations: Nomination[];
  tournamentName?: string | null;
}) {
  const rosterQuery = useRoster(tournamentId);

  const [statuses, setStatuses] = useState<Set<FighterStatus>>(new Set());
  const [nominationIds, setNominationIds] = useState<Set<string>>(new Set());
  const [clubs, setClubs] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openFighterId, setOpenFighterId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const all = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  // statusCounts не зависит от фильтров/поиска намеренно (FR-7/AC-2).
  const counts = useMemo(() => statusCounts(all), [all]);
  const clubOpts = useMemo(() => clubOptions(all), [all]);
  const filtered = useMemo(
    () => filterFighters(all, { statuses, nominationIds, clubs, query }),
    [all, statuses, nominationIds, clubs, query],
  );
  const sorted = useMemo(() => sortFighters(filtered), [filtered]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = clampPage(page, pageCount);
  const pageItems = pageSlice(sorted, currentPage, PAGE_SIZE);

  const crumb = tournamentName ? `БОЙЦЫ · ${tournamentName.toUpperCase()}` : "БОЙЦЫ";
  const meta = `${all.length} ${fightersCountWord(all.length)} · ${nominations.length} ${nominationsCountWord(nominations.length)}`;

  function onStatusesChange(next: Set<FighterStatus>) {
    setStatuses(next);
    setPage(1); // FR-11: смена фильтра возвращает на первую страницу.
  }

  function onNominationIdsChange(next: Set<string>) {
    setNominationIds(next);
    setPage(1);
  }

  function onClubsChange(next: Set<string>) {
    setClubs(next);
    setPage(1);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function resetFilters() {
    setStatuses(new Set());
    setNominationIds(new Set());
    setClubs(new Set());
    setQuery("");
    setPage(1);
  }

  return (
    <div data-slot="fighters-screen" className="flex flex-col">
      <PageHeader
        crumb={crumb}
        title="Бойцы"
        meta={meta}
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + Боец вручную
          </Button>
        }
      />

      <div className="flex flex-col gap-6 p-4">
        <FightersFilters
          statuses={statuses}
          onStatusesChange={onStatusesChange}
          counts={counts}
          nominations={nominations}
          nominationIds={nominationIds}
          onNominationIdsChange={onNominationIdsChange}
          clubs={clubs}
          onClubsChange={onClubsChange}
          clubOptions={clubOpts}
          query={query}
          onQueryChange={onQueryChange}
          onReset={resetFilters}
        />

        <FightersTable
          fighters={pageItems}
          nominations={nominations}
          isLoading={rosterQuery.isLoading}
          error={rosterQuery.error}
          onRetry={() => rosterQuery.refetch()}
          hasAnyFighters={all.length > 0}
          onOpenCard={setOpenFighterId}
        />

        {pageCount > 1 && (
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        )}
      </div>

      {openFighterId && (
        <FighterCardDialog
          fighterId={openFighterId}
          fighters={all}
          nominations={nominations}
          open={openFighterId !== null}
          onOpenChange={(next) => {
            if (!next) setOpenFighterId(null);
          }}
        />
      )}

      <CreateFighterDialog
        tournamentId={tournamentId}
        nominations={nominations}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(fighter: Fighter) => toastSuccess(`${fighter.name} добавлен`)}
      />
    </div>
  );
}
