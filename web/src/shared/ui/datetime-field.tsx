"use client";

import * as React from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { dateToIso, parseIsoToDate } from "@/shared/lib/datetime";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

/**
 * DateTimeField (FR-12, T10): выбор дал приоритет **запасному варианту** из
 * `plan.md` («Риски») — собственная сетка месяца поверх Radix `Popover`
 * (`Intl.DateTimeFormat`, без `date-fns`) вместо `react-day-picker`.
 * `react-day-picker@10` сменил модель стилизации (classNames по `UI`-энуму,
 * без готового `style.css`), и подгонка под токены дизайн-системы плюс
 * русская локаль заняла бы непропорционально много относительно объёма
 * самого поля. Публичный API (`value`/`onChange`/`withTime`) от выбора не
 * зависит — при необходимости реализацию можно заменить, не трогая вызовы.
 */

export type DateTimeFieldProps = {
  /** ISO-строка или `null` — управляемое значение. */
  value: string | null;
  /** Вызывается с ISO-строкой при выборе даты/времени. */
  onChange: (value: string) => void;
  /** Показывать ли выбор времени вместе с датой. */
  withTime?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Индекс дня недели с понедельника (0=Пн … 6=Вс), в отличие от `Date#getDay`. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDisplay(date: Date, withTime: boolean): string {
  const datePart = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  if (!withTime) return datePart;
  return `${datePart}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeValue(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DateTimeField({
  value,
  onChange,
  withTime = false,
  placeholder = "Выбрать дату",
  id,
  className,
}: DateTimeFieldProps) {
  const selected = parseIsoToDate(value);
  const [open, setOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(() => selected ?? new Date());

  React.useEffect(() => {
    if (selected) setViewDate(selected);
    // Пересинхронизируем месяц отображения только при смене значения извне.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commitDate(day: Date) {
    const next = new Date(day);
    if (selected) {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    } else {
      next.setHours(0, 0, 0, 0);
    }
    onChange(dateToIso(next));
  }

  function commitTime(timeValue: string) {
    const [hh, mm] = timeValue.split(":").map(Number);
    const base = selected ?? viewDate;
    const next = new Date(base);
    next.setHours(hh || 0, mm || 0, 0, 0);
    onChange(dateToIso(next));
  }

  const first = startOfMonth(viewDate);
  const leading = mondayIndex(first);
  const total = daysInMonth(viewDate);
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: total },
      (_, i) => new Date(viewDate.getFullYear(), viewDate.getMonth(), i + 1),
    ),
  ];

  const monthLabel = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(viewDate);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn("justify-start font-normal", className)}
        >
          <CalendarIcon className="mr-2 size-4" />
          {selected ? formatDisplay(selected, withTime) : placeholder}
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="datetime-field-content"
          align="start"
          sideOffset={4}
          className="z-50 w-64 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none"
        >
          <div className="mb-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Предыдущий месяц"
              onClick={() =>
                setViewDate(
                  new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeftIcon />
            </Button>
            <span className="text-sm font-medium capitalize">{monthLabel}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Следующий месяц"
              onClick={() =>
                setViewDate(
                  new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-caption-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) =>
              day ? (
                <button
                  key={day.toISOString()}
                  type="button"
                  aria-pressed={selected ? isSameDay(day, selected) : false}
                  className={cn(
                    "rounded-md p-1 text-sm hover:bg-accent",
                    selected &&
                      isSameDay(day, selected) &&
                      "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                  onClick={() => {
                    commitDate(day);
                    if (!withTime) setOpen(false);
                  }}
                >
                  {day.getDate()}
                </button>
              ) : (
                <div key={`empty-${i}`} />
              ),
            )}
          </div>
          {withTime && (
            <div className="mt-3 flex items-center gap-2">
              <label
                htmlFor={`${id ?? "datetime-field"}-time`}
                className="text-xs text-caption-foreground"
              >
                Время
              </label>
              <input
                id={`${id ?? "datetime-field"}-time`}
                type="time"
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                value={selected ? formatTimeValue(selected) : ""}
                onChange={(e) => commitTime(e.target.value)}
              />
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
