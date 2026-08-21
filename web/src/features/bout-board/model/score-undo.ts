/**
 * Отмена последнего шага счёта (спека 0033, FR-19/AC-8): панель секретаря
 * помнит только **последний** шаг этой сессии — не историю на несколько
 * шагов назад. `pushStep` каждый раз перезаписывает состояние; `undoTarget`
 * возвращает абсолютный счёт, к которому нужно вернуться, и `null`, если
 * отмена недоступна (шагов не было либо бой сменился с момента шага).
 */

/**
 * ScoreUndoState — память последнего шага. `label` — уже готовая подпись
 * кнопки («Отменить +1 красному»); `sideLabel` («красному»/«синему») знает
 * вызывающий UI (цвет — не забота этой чистой модели, она про счёт).
 */
export type ScoreUndoState = {
  boutId: string;
  previousScoreA: number;
  previousScoreB: number;
  label: string;
} | null;

/**
 * pushStep — фиксирует шаг счёта как «последний» (заменяет любое
 * предыдущее состояние, даже для того же боя — история глубже одного шага
 * не нужна). `before` — счёт **до** этого шага, к которому вернёт
 * `undoTarget`.
 */
export function pushStep(
  _prevState: ScoreUndoState,
  boutId: string,
  before: { scoreA: number; scoreB: number },
  side: "A" | "B",
  delta: number,
  sideLabel: string,
): ScoreUndoState {
  // side не входит в label — какой цвет отменяется знает вызывающий UI
  // (sideLabel); параметр в сигнатуре ради симметрии с applyPendingStep.
  void side;
  const sign = delta > 0 ? "+" : "";
  return {
    boutId,
    previousScoreA: before.scoreA,
    previousScoreB: before.scoreB,
    label: `Отменить ${sign}${delta} ${sideLabel}`,
  };
}

/**
 * undoTarget — счёт, к которому вернёт «Отменить». `null`, если состояния
 * нет (шагов не было) либо `currentBoutId` не совпадает с боем шага (смена
 * боя сбрасывает отмену, FR-19).
 */
export function undoTarget(
  state: ScoreUndoState,
  currentBoutId: string,
): { scoreA: number; scoreB: number } | null {
  if (!state || state.boutId !== currentBoutId) return null;
  return { scoreA: state.previousScoreA, scoreB: state.previousScoreB };
}
