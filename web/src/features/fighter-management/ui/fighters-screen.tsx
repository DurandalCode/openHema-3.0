"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";
import { Pagination } from "@/shared/ui/pagination";
import { clampPage } from "@/shared/lib/paginate";
import { toastSuccess } from "@/shared/lib/toast";
import type { Fighter, FighterStatus } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { rosterExportUrl, type RosterFilterQuery } from "../api/requests";
import { useFullRoster } from "../api/use-full-roster";
import { useRoster } from "../api/use-roster";
import { clubOptions } from "../lib/select-fighters";
import { CreateFighterDialog } from "./create-fighter-dialog";
import { FighterCardDialog } from "./fighter-card-dialog";
import { countWord, FightersFilters } from "./fighters-filters";
import { FightersTable } from "./fighters-table";
import { FindFighterByAccountDialog } from "./find-fighter-by-account-dialog";
import { ImportFightersDialog } from "./import-fighters-dialog";
import { MergeFightersDialog } from "./merge-fighters-dialog";

/** PAGE_SIZE — размер серверной страницы ростера (spec 0026 FR-11). */
export const PAGE_SIZE = 20;

/** NO_CLUB — значение в `clubs`-фильтре, представляющее пункт «Без клуба» (spec 0026 FR-9). */
const NO_CLUB = "";

function fightersCountWord(n: number): string {
  return countWord(n, ["боец", "бойца", "бойцов"]);
}

function nominationsCountWord(n: number): string {
  return countWord(n, ["номинация", "номинации", "номинаций"]);
}

/**
 * FightersScreen — корень экрана «Бойцы» (spec FR-1…FR-25, спека 0041
 * T20-T24): ростер таблицей с детерминированным порядком, чипы статусов со
 * счётчиками по всему ростеру, выпадающие фильтры номинации/клуба, поиск,
 * серверная пагинация, экспорт в CSV под текущий фильтр (FR-14), карточка
 * бойца (перевод/вывод/возврат/правка/участия) и модалка ручного заведения
 * из шапки раздела.
 *
 * Фильтр/поиск/постраничность выполняются на сервере (`useRoster`, спека
 * 0041) — `select-fighters.ts` больше не фильтрует массив. `useFullRoster`
 * — отдельный незафильтрованный запрос (план «Риски»), источник для
 * выпадающего списка клубов, счётчика в шапке и полного списка бойцов,
 * который читают `MergeFightersDialog`/`FighterCardDialog`, открытая по id
 * из «Найти по учётке» (эти id могут не входить в текущую отфильтрованную
 * страницу).
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
  const [statuses, setStatuses] = useState<Set<FighterStatus>>(new Set());
  const [nominationIds, setNominationIds] = useState<Set<string>>(new Set());
  const [clubs, setClubs] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openFighterId, setOpenFighterId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [findByAccountOpen, setFindByAccountOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // "" в clubs представляет пункт «Без клуба» (spec FR-9) — на сервере это
  // отдельный флаг includeNoClub, не элемент clubs[] (ListRosterRequest).
  const filters: RosterFilterQuery = useMemo(
    () => ({
      statuses: [...statuses],
      nominationIds: [...nominationIds],
      clubs: [...clubs].filter((c) => c !== NO_CLUB),
      includeNoClub: clubs.has(NO_CLUB),
      search: query,
    }),
    [statuses, nominationIds, clubs, query],
  );

  const rosterQuery = useRoster(tournamentId, { ...filters, page, pageSize: PAGE_SIZE });
  const fullRosterQuery = useFullRoster(tournamentId);

  const fighters = rosterQuery.data?.fighters ?? [];
  const totalCount = rosterQuery.data?.totalCount ?? 0;
  // statusCounts не зависит от фильтров/поиска намеренно (FR-7/AC-2) —
  // сервер считает их без фильтра при каждом ответе useRoster.
  const counts = rosterQuery.data?.statusCounts ?? { active: 0, withdrawn: 0 };

  const all = useMemo(() => fullRosterQuery.data ?? [], [fullRosterQuery.data]);
  const clubOpts = useMemo(() => clubOptions(all), [all]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = clampPage(page, pageCount);

  const exportUrl = rosterExportUrl(tournamentId, filters);

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
          <div className="flex items-center gap-2">
            {/* Экспорт ростера под текущий фильтр экрана в CSV (спека 0041, FR-11/FR-14/FR-16
                0026 FR-23) — обычная ссылка на BFF-роут, навигация браузера, не fetch+blob
                (план «Риски»). */}
            <Button type="button" variant="outline" asChild>
              <a href={exportUrl}>Экспорт</a>
            </Button>
            {/* Обратная проекция «учётка ↔ боец» — admin-only (спека 0040, FR-9/FR-10). */}
            <Button type="button" variant="outline" onClick={() => setFindByAccountOpen(true)}>
              Найти по учётке
            </Button>
            <Button type="button" variant="outline" onClick={() => setMergeOpen(true)}>
              Слить дубли
            </Button>
            {/* Массовый ввод ростера из файла клуба/выгрузки (спека 0049, FR-1/FR-2):
                двухшаговый — разбор с предпросмотром, затем подтверждение. */}
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              Импорт из файла
            </Button>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              + Боец вручную
            </Button>
          </div>
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
          fighters={fighters}
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

      <FindFighterByAccountDialog
        tournamentId={tournamentId}
        open={findByAccountOpen}
        onOpenChange={setFindByAccountOpen}
        onOpenFighter={setOpenFighterId}
      />

      <MergeFightersDialog fighters={all} open={mergeOpen} onOpenChange={setMergeOpen} />

      <ImportFightersDialog
        nominations={nominations}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  );
}
