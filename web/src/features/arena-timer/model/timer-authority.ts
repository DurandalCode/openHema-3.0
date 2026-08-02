/**
 * timer-authority — ядро недоменного таймера боя (спека 0015, ADR 0013):
 * чистые функции авторитетного табло №1. Без побочных эффектов и без
 * обращения к `Date.now()`/`performance.now()` внутри — текущее время
 * всегда параметр (`nowMs`), чтобы поведение было детерминированным и
 * тестируемым без реальных таймеров.
 *
 * Единственное место, где вообще происходит вычитание времени — `frameOf`.
 * Всё остальное (`apply`, `onCurrentBoutChanged`) — чистые проекции/переходы
 * состояния, использующие `frameOf` как источник «текущего отображаемого
 * значения», не пересчитывающие его самостоятельно.
 */

export type TimerStatus = "STOPPED" | "RUNNING" | "PAUSED" | "EXPIRED";

/**
 * TimerState — состояние таймера-источника (спека 0015, FR-10): `remainingCs`
 * — точное значение (сантисекунды) на момент `referenceMs`; для `RUNNING`
 * это «якорь», от которого `frameOf` отсчитывает прошедшее время. Для
 * прочих статусов `remainingCs` — уже финальное отображаемое значение
 * (пуск/пауза/сброс не «дёргают» его, FR-10).
 */
export type TimerState = {
  status: TimerStatus;
  remainingCs: number;
  referenceMs: number;
  defaultCs: number;
};

export type TimerCommand =
  | { kind: "START" }
  | { kind: "PAUSE" }
  | { kind: "RESET" }
  | { kind: "ADJUST"; amountSeconds: number };

/**
 * frameOf — чистая проекция «что показать сейчас»: не мутирует `state`.
 * Для не-`RUNNING` состояний возвращает `state` как есть (ничего не течёт).
 * Для `RUNNING` вычитает прошедшее с `referenceMs` время; на достижении 0
 * — `EXPIRED` (FR-9, стоп на 0, в минус не уходит).
 */
export function frameOf(
  state: TimerState,
  nowMs: number,
): { status: TimerStatus; remainingCs: number } {
  if (state.status !== "RUNNING") {
    return { status: state.status, remainingCs: state.remainingCs };
  }
  const elapsedCs = Math.floor((nowMs - state.referenceMs) / 10);
  const remaining = Math.max(0, state.remainingCs - elapsedCs);
  if (remaining <= 0) {
    return { status: "EXPIRED", remainingCs: 0 };
  }
  return { status: "RUNNING", remainingCs: remaining };
}

/**
 * apply — командный редьюсер: применяет одну команду панели (FR-7),
 * возвращает НОВЫЙ `TimerState`. См. семантику каждой ветки в docstring
 * задачи T14 (спека 0015, FR-9/FR-10/AC-6a/AC-7/AC-8).
 */
export function apply(state: TimerState, command: TimerCommand, nowMs: number): TimerState {
  switch (command.kind) {
    case "START": {
      const f = frameOf(state, nowMs);
      if (f.remainingCs <= 0) return state; // нечего стартовать — нужен RESET
      return { ...state, status: "RUNNING", referenceMs: nowMs };
    }
    case "PAUSE": {
      const f = frameOf(state, nowMs);
      return {
        ...state,
        status: f.status === "EXPIRED" ? "EXPIRED" : "PAUSED",
        remainingCs: f.remainingCs,
        referenceMs: nowMs,
      };
    }
    case "RESET": {
      return { ...state, status: "STOPPED", remainingCs: state.defaultCs, referenceMs: nowMs };
    }
    case "ADJUST": {
      const f = frameOf(state, nowMs);
      const remainingCs = Math.max(0, f.remainingCs + command.amountSeconds * 100);
      return { ...state, status: f.status, remainingCs, referenceMs: nowMs };
    }
    default:
      return state;
  }
}

/**
 * onCurrentBoutChanged — авто-сброс при смене текущего боя (спека 0015,
 * FR-15/AC-11): дефолт, `PAUSED` (не `STOPPED` — спека явно требует «встаёт
 * на паузу»), старт — вручную.
 */
export function onCurrentBoutChanged(state: TimerState, nowMs: number): TimerState {
  return { status: "PAUSED", remainingCs: state.defaultCs, referenceMs: nowMs, defaultCs: state.defaultCs };
}
