/**
 * shared/lib/datetime — ISO ↔ значение поля даты-времени (FR-12).
 *
 * Образец логики — `toLocalInput` из
 * `features/tournament-settings/ui/tournament-settings-form.tsx` (сама форма
 * переезжает на эти утилиты позже, в другой волне — см. `tasks.md`, T23).
 */

/** parseIsoToDate — ISO-строка → `Date`; пусто/невалидная строка → `null`. */
export function parseIsoToDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** dateToIso — `Date` → ISO-строка. */
export function dateToIso(date: Date): string {
  return date.toISOString();
}

/**
 * toLocalInputValue — ISO-строка → значение для `<input type="datetime-local">`
 * (локальное время без таймзоны, до минут). Пусто/невалидная строка → `""`.
 */
export function toLocalInputValue(iso: string | null | undefined): string {
  const date = parseIsoToDate(iso);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * fromLocalInputValue — значение `<input type="datetime-local">` → ISO-строка;
 * пусто/невалидное значение → `null`.
 */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateToIso(date);
}
