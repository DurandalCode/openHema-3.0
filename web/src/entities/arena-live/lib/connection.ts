/**
 * Состояние живого канала арены (спека 0033, FR-23/FR-24): чистое
 * форматирование полосы «Связь потеряна · N секунд» (макет 21b, «потеря
 * связи на площадке» — доменный паттерн, спека 0023 сознательно его не
 * взяла). Без React, без таймеров — `lostForMs` вычисляет вызывающий код
 * (`useArenaLive`) из `Date.now() - lostSinceMs`.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;

function secondWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "секунд";
  const mod10 = n % 10;
  if (mod10 === 1) return "секунду";
  if (mod10 >= 2 && mod10 <= 4) return "секунды";
  return "секунд";
}

function minuteWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "минут";
  const mod10 = n % 10;
  if (mod10 === 1) return "минуту";
  if (mod10 >= 2 && mod10 <= 4) return "минуты";
  return "минут";
}

/**
 * connectionLabel — подпись полосы потери связи. До минуты — секундами
 * («Связь потеряна · 12 секунд»); от минуты — минутами («Связь потеряна ·
 * 2 минуты», решение агента: спека не фиксировала формат для минут, только
 * пример на секундах). Округление — вниз (`floor`): счётчик не обещает
 * секунду, которая ещё не прошла целиком.
 */
export function connectionLabel(lostForMs: number): string {
  const clamped = Math.max(0, lostForMs);
  if (clamped < MINUTE_MS) {
    const seconds = Math.floor(clamped / SECOND_MS);
    return `Связь потеряна · ${seconds} ${secondWord(seconds)}`;
  }
  const minutes = Math.floor(clamped / MINUTE_MS);
  return `Связь потеряна · ${minutes} ${minuteWord(minutes)}`;
}

/** isOffline — `true`, пока живой канал в состоянии `lost` (FR-25). */
export function isOffline(connection: "live" | "lost"): boolean {
  return connection === "lost";
}
