/**
 * scoreboardPhase — единая точка решения «что рисует табло» (спека 0033,
 * FR-29): пять состояний экрана + `idle` для «ещё нет данных». Виджет
 * (`widgets/arena-scoreboard`) только рисует фазу, ничего не решает сам.
 *
 * Порог концовки (<5.00с, AC-15) переезжает сюда из `TimerDisplay`
 * (`remainingCs < 500`, было зашито в компоненте) — единственное место
 * истины про границу «концовка ↔ истекло».
 *
 * `displayedBoutId` — id боя, который табло **сейчас показывает** (после
 * логики удержания оглашения, которую держит `arena-scoreboard.tsx`, не эта
 * функция). Он может отставать от `board.currentBoutId`, если сервер уже
 * продвинул доску, а секретарь ещё не нажал «Показать следующий» (AC-17) —
 * поэтому состояние ищется по `displayedBoutId` внутри `board.bouts`, не по
 * `board.currentBoutId`.
 */

import type { BoutBoard } from "@/entities/pool/lib/types";
import type { TimerStatusDto } from "./types";

export type ScoreboardPhase =
  | "idle"
  | "waiting"
  | "running"
  | "endgame"
  | "expired"
  | "announced";

/** Порог концовки в сантисекундах (AC-15): строго меньше — не включительно. */
const ENDGAME_THRESHOLD_CS = 500;

export function scoreboardPhase(input: {
  board: BoutBoard | null;
  displayedBoutId: string | null;
  timerStatus: TimerStatusDto;
  remainingCs: number;
}): ScoreboardPhase {
  const { board, displayedBoutId, timerStatus, remainingCs } = input;

  if (!board || !board.pool || !displayedBoutId) return "idle";

  const displayedBout = board.bouts.find((b) => b.id === displayedBoutId) ?? null;
  if (!displayedBout) return "idle";

  // Оглашение держится независимо от таймера (AC-17) — проверяется первым.
  if (displayedBout.state === "BOUT_STATE_FINISHED") return "announced";

  if (timerStatus === "TIMER_STATUS_EXPIRED") return "expired";
  if (remainingCs < ENDGAME_THRESHOLD_CS) return "endgame";
  if (displayedBout.state === "BOUT_STATE_NOT_STARTED") return "waiting";

  return "running";
}
