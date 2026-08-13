"use client";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { filterChipVariants } from "@/shared/ui/filter-chip";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/cn";
import type { FighterStatus } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { ClubOptions, StatusCounts } from "../lib/select-fighters";

const SEARCH_ID = "fighters-search";
const NO_CLUB = "";

const STATUS_OPTIONS: { status: FighterStatus; label: string }[] = [
  { status: "FIGHTER_STATUS_ACTIVE", label: "Активные" },
  { status: "FIGHTER_STATUS_WITHDRAWN", label: "Выбыли" },
];

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * countWord — русское согласование числительного с существительным (см.
 * `nominationsCountWord` в `application-review/ui/applications-filters.tsx`
 * — тот же приём, продублированный намеренно: фичи не импортят друг друга,
 * ADR 0005).
 */
export function countWord(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = n % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function nominationsLabel(nominations: Nomination[], selected: Set<string>): string {
  if (selected.size === 0) return "Все номинации";
  if (selected.size === 1) {
    const id = [...selected][0];
    return nominations.find((n) => n.id === id)?.title ?? "1 номинация";
  }
  return `${selected.size} ${countWord(selected.size, ["номинация", "номинации", "номинаций"])}`;
}

function clubsLabel(selected: Set<string>): string {
  if (selected.size === 0) return "Все клубы";
  if (selected.size === 1) {
    const value = [...selected][0];
    return value === NO_CLUB ? "Без клуба" : value;
  }
  return `${selected.size} ${countWord(selected.size, ["клуб", "клуба", "клубов"])}`;
}

function ChipButton({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count?: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(filterChipVariants({ tone: pressed ? "active" : "idle" }))}
    >
      <span>{label}</span>
      {count !== undefined && <span className="font-mono">{count}</span>}
    </button>
  );
}

/**
 * FightersFilters — панель фильтров экрана «Бойцы» (spec FR-7..FR-10): чипы
 * статуса со счётчиками по всему ростеру (множественный выбор, `aria-
 * pressed`), выпадающие списки номинаций и клубов с множественным выбором
 * («Без клуба» — отдельный пункт, FR-9), поиск по имени/клубу, сброс — виден
 * только пока активен хоть один фильтр или поиск.
 */
export function FightersFilters({
  statuses,
  onStatusesChange,
  counts,
  nominations,
  nominationIds,
  onNominationIdsChange,
  clubs,
  onClubsChange,
  clubOptions,
  query,
  onQueryChange,
  onReset,
}: {
  statuses: Set<FighterStatus>;
  onStatusesChange: (next: Set<FighterStatus>) => void;
  counts: StatusCounts;
  nominations: Nomination[];
  nominationIds: Set<string>;
  onNominationIdsChange: (next: Set<string>) => void;
  clubs: Set<string>;
  onClubsChange: (next: Set<string>) => void;
  clubOptions: ClubOptions;
  query: string;
  onQueryChange: (value: string) => void;
  onReset: () => void;
}) {
  const hasActiveFilters =
    statuses.size > 0 || nominationIds.size > 0 || clubs.size > 0 || query.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Фильтр по статусу" className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map(({ status, label }) => (
          <ChipButton
            key={status}
            label={label}
            count={status === "FIGHTER_STATUS_ACTIVE" ? counts.active : counts.withdrawn}
            pressed={statuses.has(status)}
            onClick={() => onStatusesChange(toggled(statuses, status))}
          />
        ))}
      </div>

      {nominations.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(filterChipVariants({ tone: nominationIds.size > 0 ? "active" : "idle" }))}
          >
            <span>{nominationsLabel(nominations, nominationIds)}</span>
            <span aria-hidden className="text-caption-foreground text-[10px]">
              ▾
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {nominations.map((n) => (
              <DropdownMenuCheckboxItem
                key={n.id}
                checked={nominationIds.has(n.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onNominationIdsChange(toggled(nominationIds, n.id))}
              >
                {n.title}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {(clubOptions.clubs.length > 0 || clubOptions.hasNoClub) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(filterChipVariants({ tone: clubs.size > 0 ? "active" : "idle" }))}
          >
            <span>{clubsLabel(clubs)}</span>
            <span aria-hidden className="text-caption-foreground text-[10px]">
              ▾
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {clubOptions.clubs.map((club) => (
              <DropdownMenuCheckboxItem
                key={club}
                checked={clubs.has(club)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onClubsChange(toggled(clubs, club))}
              >
                {club}
              </DropdownMenuCheckboxItem>
            ))}
            {clubOptions.hasNoClub && (
              <DropdownMenuCheckboxItem
                checked={clubs.has(NO_CLUB)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onClubsChange(toggled(clubs, NO_CLUB))}
              >
                Без клуба
              </DropdownMenuCheckboxItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="min-w-[220px] flex-1">
        <Label htmlFor={SEARCH_ID} className="sr-only">
          Поиск по имени или клубу
        </Label>
        <Input
          id={SEARCH_ID}
          type="search"
          placeholder="Поиск по имени или клубу"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={onReset}
        >
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}
