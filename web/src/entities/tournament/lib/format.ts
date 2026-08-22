import type { ContactType } from "./types";

/** formatEventRange формирует человекочитаемый диапазон дат проведения.
 * - только start: «1 декабря 2026 г., 10:00» (однодневный).
 * - start + end, разные дни: «1 декабря 2026 г., 10:00 — 3 декабря 2026 г., 18:00».
 * - start + end, один день: «1 декабря 2026 г., 10:00 — 18:00» (только время).
 * Опционально: оба поля пусты → null ( hero скрывает строку, FR-6/AC-7). */
export function formatEventRange(startIso: string, endIso: string): string | null {
  let start = startIso ? new Date(startIso) : null;
  let end = endIso ? new Date(endIso) : null;
  if (start && Number.isNaN(start.getTime())) start = null;
  if (end && Number.isNaN(end.getTime())) end = null;
  if (!start && !end) return null;

  const startStr = start ? formatDateTime(start) : null;
  if (start && end) {
    const sameDay =
      start.toDateString() === end.toDateString();
    const endStr = sameDay ? formatTime(end) : formatDateTime(end);
    return `${startStr} — ${endStr}`;
  }
  if (start) return startStr;
  if (end) return `до ${formatDateTime(end)}`;
  return null;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" });
}

function formatTime(d: Date): string {
  return d.toLocaleString("ru-RU", { timeStyle: "short" });
}

/**
 * daysUntil — сколько дней до даты начала турнира (спека 0034, FR-4).
 * `null` — дата не задана или невалидна. `0` — начинается сегодня
 * («до старта: сегодня», не «0 дней» — форматирование этого текста уже
 * забота компонента, не этой функции).
 *
 * Для даты в прошлом эта функция намеренно не возвращает `null` и не
 * запрещает отрицательный результат: определять, что турнир уже идёт или
 * прошёл — задача `tournamentPhase` (`entities/tournament-live/lib/phase.ts`),
 * а не этой чистой функции подсчёта дней. Компонент афиши «до старта»
 * вызывает `daysUntil` только когда уже знает (из `tournamentPhase`), что
 * турнир ещё не начался — отрицательное значение сюда дойти не должно, но
 * функция не обязана сама это гарантировать.
 */
export function daysUntil(startIso: string | null, now: Date): number | null {
  if (!startIso) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  return Math.round((startDay - nowDay) / MS_PER_DAY);
}

/** contactHref превращает пару (тип, значение) в URL ссылки. */
export function contactHref(type: ContactType, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  switch (type) {
    case "CONTACT_TYPE_TELEGRAM":
      return value.startsWith("@")
        ? `https://t.me/${value.slice(1)}`
        : `https://t.me/${value}`;
    case "CONTACT_TYPE_VK":
      return /^https?:\/\//i.test(value)
        ? value
        : `https://vk.com/${value.replace(/^\//, "")}`;
    case "CONTACT_TYPE_FACEBOOK":
      return /^https?:\/\//i.test(value)
        ? value
        : `https://facebook.com/${value.replace(/^\//, "")}`;
    case "CONTACT_TYPE_EMAIL":
      return value.includes(":") ? value : `mailto:${value}`;
    case "CONTACT_TYPE_WEBSITE":
    case "CONTACT_TYPE_OTHER":
    default:
      return value;
  }
}
