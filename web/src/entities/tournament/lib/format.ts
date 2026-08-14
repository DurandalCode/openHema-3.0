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
