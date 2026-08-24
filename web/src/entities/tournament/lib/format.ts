import type { ContactType, Tournament } from "./types";
import { entryFeeMinorToAmount } from "./draft";

/**
 * CONTACT_LABELS — человекочитаемые подписи типов контактов (спека 0034,
 * T20). Единственное место в кодовой базе: `tournament-hero.tsx` (афиша «до
 * старта») и `widgets/home/venue-contacts.tsx` (блок «Зрителю», FR-10/FR-22)
 * читают её через `contactLabel`, а не дублируют словарь каждый у себя.
 */
const CONTACT_LABELS: Partial<Record<ContactType, string>> = {
  CONTACT_TYPE_TELEGRAM: "Telegram",
  CONTACT_TYPE_VK: "VK",
  CONTACT_TYPE_FACEBOOK: "Facebook",
  CONTACT_TYPE_WEBSITE: "Сайт",
  CONTACT_TYPE_EMAIL: "Email",
  CONTACT_TYPE_OTHER: "Контакт",
};

/** contactLabel — подпись типа контакта (RU), "Контакт" — фолбэк для
 * неизвестного/неуказанного типа (тот же, что раньше был инлайн в
 * `tournament-hero.tsx`). */
export function contactLabel(type: ContactType): string {
  return CONTACT_LABELS[type] ?? "Контакт";
}

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

/**
 * formatEntryFee — сумма взноса за номинацию для показа (спека 0038,
 * FR-43/FR-44), не для формы ввода. Отличается от `entryFeeMinorToAmount`
 * (`lib/draft.ts`), которая отдаёт голое число строкой для инпута формы:
 * здесь нужен готовый к рендеру текст с валютой и текстом «Бесплатно».
 *
 * Конвертация минорных единиц в основные (копейки → рубли) переиспользуется
 * из `entryFeeMinorToAmount`, а не копируется — единственное место с этой
 * арифметикой остаётся `lib/draft.ts` (его домен — редактирование, но сама
 * формула конвертации от направления не зависит).
 *
 * - `minor === null` — взнос не задан: плитка взноса не рендерится вовсе
 *   (FR-44), поэтому здесь тоже `null` — решение «не показывать» остаётся
 *   за вызывающим компонентом, а не размазывается по функциям форматирования.
 * - `minor === 0` — участие бесплатное, отличимо от «не задано» (0037,
 *   FR-21) человекочитаемым текстом, а не «0 RUB».
 * - `minor > 0` — сумма в основных единицах с кодом валюты. Валюта —
 *   свободная строка без проверки на ISO-4217 (форма настроек её не
 *   валидирует, `tournament-settings-form.tsx`), поэтому не используется
 *   `Intl.NumberFormat(..., { style: "currency" })` — он бросает
 *   `RangeError` на нераспознанном коде; группировка разрядов —
 *   `Intl.NumberFormat("ru-RU")` без `style`, код валюты дописывается рядом
 *   простым текстом.
 */
export function formatEntryFee(minor: number | null, currency: string): string | null {
  if (minor === null) return null;
  if (minor === 0) return "Бесплатно";

  const amount = Number(entryFeeMinorToAmount(minor));
  const formatted = new Intl.NumberFormat("ru-RU").format(amount);
  return currency ? `${formatted} ${currency}` : formatted;
}

/**
 * venueLine — место проведения турнира для показа: «название площадки,
 * адрес» (спека 0039, FR-1). Каждая часть независимо опциональна (правило
 * 0001): пустая склеивается без запятой-разделителя, обе пустые — пустая
 * строка (вызывающий компонент решает не рендерить блок вовсе, как уже
 * делает `widgets/tournament-about/about-facts.tsx`).
 */
export function venueLine(t: Tournament): string {
  return [t.venueName, t.venueAddress].filter(Boolean).join(", ");
}
