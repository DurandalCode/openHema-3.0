/**
 * shared/lib/forecast-time — форматирование операционной оценки (спека
 * 0043, ADR 0020): единственное место, где текст прогноза собирается из
 * чисел. Ни один экран не форматирует прогноз сам (NFR-1) — сервер отдаёт
 * готовое значение (`BoutForecast`), эта функция превращает его в строку.
 *
 * `minuteWord` переиспользован из `./datetime` — то же склонение, что у
 * `formatRelativeTime`.
 */

import { minuteWord } from "./datetime";

/**
 * ForecastDto — прогноз одного боя (спека 0043, FR-6/FR-7). Отсутствие
 * прогноза выражается `expectedStartAt: null` — та же семантика, что у
 * `LiveFeedBoutDto.startedAt/finishedAt` (0034): не заполненное значение, а
 * не эпоха/ноль. Значим только когда `expectedStartAt !== null`.
 */
export type ForecastDto = {
  expectedStartAt: string | null;
  boutsAhead: number;
  provisional: boolean;
  imminent: boolean;
};

/** emptyForecast — прогноза нет (бой вне горизонта оценки, FR-9/FR-24). */
export function emptyForecast(): ForecastDto {
  return { expectedStartAt: null, boutsAhead: 0, provisional: false, imminent: false };
}

/** formatForecastClock — «11:20»: локальные часы:минуты момента прогноза. */
export function formatForecastClock(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MINUTE_MS = 60_000;

/**
 * formatForecastCountdown — «через ~14 минут»: остаток до момента прогноза
 * от `now`, минимум одна минута (не уходит в «~0 минут» при остатке
 * меньше минуты — этот случай уже покрыт `imminent`, здесь просто защита
 * от нуля/дробей при вызове напрямую).
 */
export function formatForecastCountdown(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const minutes = Math.max(1, Math.round(diffMs / MINUTE_MS));
  return `через ~${minutes} ${minuteWord(minutes)}`;
}

/**
 * formatForecastSummary — итоговая строка прогноза (ADR 0020, п.7, AC-4):
 * `imminent=true` → «вот-вот» (расчётное время уже прошло или наступает
 * прямо сейчас — не отрицательный интервал и не время из прошлого);
 * иначе → «ориентировочно HH:MM · через ~N минут».
 */
export function formatForecastSummary(
  iso: string,
  imminent: boolean,
  now: Date = new Date(),
): string {
  if (imminent) return "вот-вот";
  return `ориентировочно ${formatForecastClock(iso)} · ${formatForecastCountdown(iso, now)}`;
}
