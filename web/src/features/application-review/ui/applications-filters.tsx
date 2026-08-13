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
import type { ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { StatusCounts } from "../lib/select-applications";

const SEARCH_ID = "applications-search";

const STATUS_OPTIONS: { state: ApplicationState; label: string }[] = [
  { state: "APPLICATION_STATE_SUBMITTED", label: "Подана" },
  { state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION", label: "Ожидает подтверждения" },
  { state: "APPLICATION_STATE_PAID", label: "Оплачена" },
  { state: "APPLICATION_STATE_REGISTERED", label: "Зарегистрирована" },
  { state: "APPLICATION_STATE_WITHDRAWN", label: "Отозвана" },
];

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * nominationsCountWord — русское согласование числительного с «номинация»
 * (см. `daysAgoWord` в `shared/lib/datetime.ts` — тот же приём). N=1
 * обрабатывается отдельно (название номинации, не счётчик), сюда попадает
 * только N ≥ 2.
 */
export function nominationsCountWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "номинаций";
  const mod10 = n % 10;
  if (mod10 === 1) return "номинация";
  if (mod10 >= 2 && mod10 <= 4) return "номинации";
  return "номинаций";
}

function nominationsLabel(nominations: Nomination[], selected: Set<string>): string {
  if (selected.size === 0) return "Все номинации";
  if (selected.size === 1) {
    const id = [...selected][0];
    return nominations.find((n) => n.id === id)?.title ?? "1 номинация";
  }
  return `${selected.size} ${nominationsCountWord(selected.size)}`;
}

/**
 * StatusChip / ChipButton — переключатель фильтра поверх стилей `FilterChip`
 * (спека 0022) с настоящей a11y-семантикой (`aria-pressed`), которой
 * `FilterChip` сам по себе не отдаёт (см. `features/admin/ui/users-filters.tsx`
 * `RoleChip`, тот же приём — переиспользуем экспортированный
 * `filterChipVariants`, не трогая `shared/ui/filter-chip.tsx`).
 */
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
 * ApplicationsFilters — панель фильтров экрана «Заявки» (spec FR-7..FR-10):
 * чипы статусов со счётчиками (множественный выбор, `aria-pressed`, FR-7/
 * FR-8/AC-3), выпадающий список номинаций с множественным выбором (FR-9/
 * AC-4), чип «нужна экипировка», поиск по имени/клубу с доступным именем,
 * сброс — виден только пока активен хоть один фильтр или поиск (FR-10).
 * Управляемый компонент: состояние живёт выше (экран).
 */
export function ApplicationsFilters({
  statuses,
  onStatusesChange,
  counts,
  nominations,
  nominationIds,
  onNominationIdsChange,
  needsEquipment,
  onNeedsEquipmentChange,
  query,
  onQueryChange,
  onReset,
}: {
  statuses: Set<ApplicationState>;
  onStatusesChange: (next: Set<ApplicationState>) => void;
  counts: StatusCounts;
  nominations: Nomination[];
  nominationIds: Set<string>;
  onNominationIdsChange: (next: Set<string>) => void;
  needsEquipment: boolean;
  onNeedsEquipmentChange: (value: boolean) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onReset: () => void;
}) {
  const hasActiveFilters =
    statuses.size > 0 || nominationIds.size > 0 || needsEquipment || query.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Фильтр по статусу" className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map(({ state, label }) => (
          <ChipButton
            key={state}
            label={label}
            count={counts[state]}
            pressed={statuses.has(state)}
            onClick={() => onStatusesChange(toggled(statuses, state))}
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

      <ChipButton
        label="Нужна экипировка"
        pressed={needsEquipment}
        onClick={() => onNeedsEquipmentChange(!needsEquipment)}
      />

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
