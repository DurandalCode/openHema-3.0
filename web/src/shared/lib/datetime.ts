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

const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Порог (в днях), ниже которого разница показывается как «N дней назад». */
const RELATIVE_DAYS_THRESHOLD = 7;

function daysAgoWord(days: number): string {
  if (days % 10 === 1 && days % 100 !== 11) return "день";
  if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) {
    return "дня";
  }
  return "дней";
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * formatRelativeDay — колонка «Регистрация» (FR-2 спеки 0024): «сегодня» /
 * «вчера» / «N дней назад» (небольшое N) / далее «18 мар» (в этом
 * календарном году) / «18 мар 2025» (в прошлом году). `now` передаётся
 * явно, чтобы вызов не зависел от системных часов; по умолчанию — текущее
 * время. Пусто/невалидная строка → `""`.
 */
export function formatRelativeDay(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  const date = parseIsoToDate(iso);
  if (!date) return "";

  const diffDays = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000,
  );

  if (diffDays === 0) return "сегодня";
  if (diffDays === 1) return "вчера";
  if (diffDays >= 2 && diffDays < RELATIVE_DAYS_THRESHOLD) {
    return `${diffDays} ${daysAgoWord(diffDays)} назад`;
  }

  const day = date.getDate();
  const month = MONTHS_SHORT[date.getMonth()];
  if (date.getFullYear() === now.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${date.getFullYear()}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function minuteWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "минуту";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) {
    return "минуты";
  }
  return "минут";
}

function hourWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "час";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) {
    return "часа";
  }
  return "часов";
}

/**
 * formatRelativeTime — признак «Изменено …» в шапке экрана «Турнир» (spec
 * 0029, FR-1): «только что» (< минуты), «N минут/часов назад» со
 * склонениями, а начиная с полных суток — делегирует существующей
 * `formatRelativeDay` (0024), не повторяя её пороги и склонения дней.
 * `now` передаётся явно (тесты не зависят от системных часов). Пусто/
 * невалидная строка → `""`.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  const date = parseIsoToDate(iso);
  if (!date) return "";

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  if (diffMs < MINUTE_MS) return "только что";
  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    return `${minutes} ${minuteWord(minutes)} назад`;
  }
  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS);
    return `${hours} ${hourWord(hours)} назад`;
  }
  return formatRelativeDay(iso, now);
}

/**
 * formatDateTime — полная дата и время для подсказки при наведении (FR-2
 * спеки 0024), например «12 августа 2026, 14:30». Пусто/невалидная строка
 * → `""`.
 */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parseIsoToDate(iso);
  if (!date) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  const day = date.getDate();
  const month = MONTHS_GENITIVE[date.getMonth()];
  return `${day} ${month} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
