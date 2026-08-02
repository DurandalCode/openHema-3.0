/**
 * timer-follower — приём таймера на НЕ-источнике (панель, второе/третье
 * табло, спека 0015, ADR 0013 §2): превращает присланный сервером
 * `TimerFrame`-подобный кадр в `TimerState` того же типа, что использует
 * `timer-authority` (реэкспортирует его `frameOf` для локального довода
 * между кадрами — математика одна и та же, не дублируется).
 */

import type { TimerState, TimerStatus } from "./timer-authority";

export { frameOf } from "./timer-authority";
export type { TimerState, TimerStatus } from "./timer-authority";

/**
 * applyFrame — превращает присланный кадр в `TimerState`, компенсируя
 * сетевую задержку: переводит `sampledUnixMs` (по часам сервера/авторитета)
 * в локальную временную шкалу через `serverOffsetMs` (`serverNowUnixMs −
 * Date.now()`, вычисляется вызывающим хуком в момент получения кадра — эта
 * функция чистая, `Date.now()` внутри не трогает). Дальше к результату
 * применяется тот же `frameOf`, что у авторитета.
 */
export function applyFrame(
  frame: { status: TimerStatus; remainingCs: number; sampledUnixMs: number; defaultCs: number },
  serverOffsetMs: number,
  // nowMs — часть публичного контракта (симметрична apply/onCurrentBoutChanged
  // в timer-authority, детерминированность без Date.now() внутри), но сама
  // функция его не использует: проекция «что показать сейчас» происходит
  // отдельным вызовом frameOf(state, nowMs) после applyFrame (см. docstring).
  nowMs: number,
): TimerState {
  void nowMs;
  const referenceMs = frame.sampledUnixMs - serverOffsetMs;
  return {
    status: frame.status,
    remainingCs: frame.remainingCs,
    referenceMs,
    defaultCs: frame.defaultCs,
  };
}

/**
 * smoothDisplay — косметический lerp отображаемого значения к целевому за
 * `dtMs` (только для рендера, не для логики: сама логика остаётся в
 * `frameOf`/`applyFrame`). Клэмп: если разница между `displayedCs` и
 * `targetCs` больше половины дефолта — скачок не сетевой (смена боя/RESET/
 * большой ADJUST), сглаживание отключается и возвращается `targetCs` сразу
 * (иначе смена боя выглядела бы как «отмотка»).
 */
const SMOOTH_RATE_PER_SEC = 8; // доля расстояния до цели, покрываемая за 1с

export function smoothDisplay(
  displayedCs: number,
  targetCs: number,
  dtMs: number,
  defaultCs: number,
): number {
  const diff = targetCs - displayedCs;
  const bigJumpThreshold = defaultCs / 2;
  if (Math.abs(diff) > bigJumpThreshold) {
    return targetCs;
  }
  if (diff === 0) return displayedCs;

  const factor = Math.min(1, (SMOOTH_RATE_PER_SEC * dtMs) / 1000);
  const next = displayedCs + diff * factor;

  // Не перелетаем цель: если шаг перескочил через target, останавливаемся
  // ровно на нём.
  const overshot = (diff > 0 && next > targetCs) || (diff < 0 && next < targetCs);
  return overshot ? targetCs : next;
}
