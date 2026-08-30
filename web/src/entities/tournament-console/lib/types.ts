/**
 * Пульт турнира целиком (спека 0043, ADR 0020, FR-8/FR-9/FR-19): все
 * неархивные площадки с темпом/прогнозом, все номинации с остатком боёв,
 * очередь готовых к постановке пулов, лента «требует внимания». Ручные
 * TypeScript-типы (camelCase), тот же жанр DTO, что
 * `TournamentLiveSnapshotDto` (`entities/tournament-live/lib/types.ts`), но
 * для admin-only экрана `/admin/console`.
 *
 * Переиспользует `BoardBout`/`FighterRef` (`entities/pool/lib/types`) и
 * `LiveNominationPhase` (`entities/tournament-live/lib/types`) — не
 * заводит вторых копий одних и тех же осей.
 */

import type { BoardBout } from "@/entities/pool/lib/types";
import type { LiveNominationPhase } from "@/entities/tournament-live/lib/types";
import { emptyForecast, type ForecastDto, type PaceEstimateDto } from "@/shared/lib/forecast-time";

/**
 * ArenaIdleState — простой площадки (спека 0043, FR-26/FR-28).
 * `waiting_first_pool` — на площадку в этом турнире ни разу не ставили пул
 * (`freeSince` не задан); `free` — пул сняли, `freeSince` задан; `occupied`
 * — пул стоит.
 */
export type ArenaIdleState = "occupied" | "waiting_first_pool" | "free";

/**
 * idleLabel — подпись простоя площадки (FR-26/FR-28), общая для пульта
 * (`ConsoleArenaCard`) и доски площадок (`entities/arena-live`, AC-16/
 * AC-17): «Ждёт первый пул» / «Свободна» / «Свободна · N мин». Не вызывать
 * для `idleState === "occupied"` — там подпись решает вызывающий (занятая
 * карточка не показывает эту строку вовсе).
 */
export function idleLabel(
  idleState: ArenaIdleState,
  freeSince: string | null,
  now: Date = new Date(),
): string {
  if (idleState === "waiting_first_pool") return "Ждёт первый пул";
  if (idleState === "free" && freeSince) {
    const minutes = Math.max(0, Math.round((now.getTime() - new Date(freeSince).getTime()) / 60000));
    return `Свободна · ${minutes} мин`;
  }
  return "Свободна";
}

/**
 * ConsoleAlertKind — вид записи ленты «требует внимания» (спека 0043,
 * FR-15). Ровно шесть видов, пороги — константы сервера.
 */
export type ConsoleAlertKind =
  | "arena_idle"
  | "bout_stuck"
  | "pool_not_started"
  | "pool_done_not_unseated"
  | "next_stage_not_built"
  | "nomination_stalled";

/**
 * ConsoleArena — карточка площадки пульта (FR-11). `currentBout`/`pace`/
 * `poolExpectedFinishAt` заполнены, только когда `idleState === "occupied"`.
 */
export type ConsoleArena = {
  arenaId: string;
  arenaName: string;
  position: number;
  idleState: ArenaIdleState;
  freeSince: string | null;
  nominationId: string;
  nominationName: string;
  stageTitle: string;
  poolId: string;
  poolName: string;
  currentBout: BoardBout | null;
  boutTotal: number;
  boutFinished: number;
  pace: PaceEstimateDto | null;
  poolExpectedFinishAt: string | null;
};

/**
 * ConsoleNomination — строка номинации пульта (FR-12). `expectedFinishAt`
 * — максимум по её поставленным пулам, `null` если поставленных пулов с
 * непроведёнными боями нет; `boutRemainingUnseated` — остаток боёв
 * непоставленных пулов числом, без времени (горизонт оценки, FR-9).
 */
export type ConsoleNomination = {
  nominationId: string;
  title: string;
  position: number;
  phase: LiveNominationPhase;
  currentStageTitle: string;
  boutTotal: number;
  boutFinished: number;
  boutRemainingUnseated: number;
  expectedFinishAt: string | null;
  provisional: boolean;
};

/**
 * ConsoleQueueItem — готовый к постановке пул в очереди пульта (FR-13):
 * тот же набор, что предлагает постановка пула на площадку.
 */
export type ConsoleQueueItem = {
  poolId: string;
  nominationId: string;
  nominationName: string;
  stageTitle: string;
  poolName: string;
  boutCount: number;
  estimatedSeconds: number;
};

/**
 * ConsoleAlert — одна запись ленты «требует внимания» (FR-14/FR-15).
 * Заполнены только поля, осмысленные для `kind` (см. серверный
 * doc-комментарий `domain.ConsoleAlert`).
 */
export type ConsoleAlert = {
  kind: ConsoleAlertKind;
  since: string;
  arenaId: string;
  arenaName: string;
  nominationId: string;
  nominationName: string;
  poolId: string;
  poolName: string;
  boutId: string;
};

/**
 * TournamentConsoleSnapshotDto — пульт турнира целиком: общий payload
 * unary- и streaming-ответа. `serverNowUnixMs` — та же опора «обновлено N
 * сек назад», что у `TournamentLiveSnapshotDto` (int64 → строка).
 */
export type TournamentConsoleSnapshotDto = {
  tournamentId: string;
  arenas: ConsoleArena[];
  nominations: ConsoleNomination[];
  queue: ConsoleQueueItem[];
  alerts: ConsoleAlert[];
  serverNowUnixMs: string;
};

/** emptyConsoleSnapshot — снапшот-заглушка (нет активного турнира, либо gRPC упал при SSR). */
export function emptyConsoleSnapshot(tournamentId: string): TournamentConsoleSnapshotDto {
  return {
    tournamentId,
    arenas: [],
    nominations: [],
    queue: [],
    alerts: [],
    serverNowUnixMs: "0",
  };
}

/** forecastOf — прогноз боя, безопасный к отсутствию поля (см. BoardBout.forecast). */
export function forecastOf(bout: Pick<BoardBout, "forecast">): ForecastDto {
  return bout.forecast ?? emptyForecast();
}
