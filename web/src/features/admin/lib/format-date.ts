/**
 * format-date — ЛОКАЛЬНАЯ временная замена `shared/lib/datetime.ts`
 * (`formatRelativeDay`, `formatDateTime`), которые параллельно строит
 * Трек A (см. `tasks.md`, T3) в другом worktree и которых в этом дереве ещё
 * нет. Чтобы Трек B не блокировался на Треке A, колонка «Регистрация»
 * (FR-2) временно форматируется этим модулем; на join-волне (T13)
 * вызывающий код переключается на реальный `shared/lib/datetime.ts` с тем
 * же сигнатурным контрактом (`formatRelativeDay(iso, now)`, `formatDateTime(iso)`),
 * а этот файл удаляется.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
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

/**
 * formatRelativeDay — «сегодня» / «вчера» / «N дней назад» / дата (FR-2).
 * `now` — явный параметр, чтобы вызывающий код (и его тесты) не зависел от
 * системного времени.
 */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY_MS,
  );

  if (diffDays === 0) return "сегодня";
  if (diffDays === 1) return "вчера";
  if (diffDays > 1 && diffDays < 30) return `${diffDays} дней назад`;

  const day = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/** formatDateTime — полная дата и время (для подсказки, FR-2/AC-2). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
