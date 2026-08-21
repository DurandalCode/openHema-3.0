/**
 * Удержание счёта в офлайне (спека 0033, FR-26/AC-13): пока связи с
 * сервером нет, шаги счёта копятся локально в одно абсолютное значение —
 * очередь отдельных шагов сознательно не хранится (команда `ScoreCurrentBout`
 * абсолютна, не инкрементальна; список шагов обещал бы воспроизведение по
 * порядку, которого система не даёт). Схлопывание делает эта функция, а не
 * вызывающий код: три клика в офлайне дают тот же `PendingScore`, что и один
 * прямой вызов с суммарной дельтой.
 */

import { applyScoreStep } from "./score-step";

/** PendingScore — удержанный локально счёт; `null` — шагов в офлайне ещё не было. */
export type PendingScore = { scoreA: number; scoreB: number } | null;

/**
 * applyPendingStep — очередной шаг в офлайне. Отсчёт — от `current`, если он
 * уже есть (накопление), либо от `base` (последний известный серверный
 * счёт) на первом шаге. Клэмп к нулю на каждой стороне — как у
 * `applyScoreStep` (переиспользуется, вторая арифметика не заводится).
 */
export function applyPendingStep(
  current: PendingScore,
  base: { scoreA: number; scoreB: number },
  side: "A" | "B",
  delta: number,
): PendingScore {
  const from = current ?? base;
  if (side === "A") {
    return { scoreA: applyScoreStep(from.scoreA, delta), scoreB: from.scoreB };
  }
  return { scoreA: from.scoreA, scoreB: applyScoreStep(from.scoreB, delta) };
}

/** clearPending — сброс удержанного счёта (после успешной досылки, FR-27). */
export function clearPending(): PendingScore {
  return null;
}
