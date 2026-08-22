/**
 * Живая сводка турнира целиком (спека 0034, FR-12..FR-22): площадки
 * прямо сейчас, лента боёв дня и положение номинаций. Тот же жанр DTO, что
 * `NominationLiveSnapshotDto` (`entities/nomination-live/lib/types.ts`), но
 * на уровень выше — весь турнир, а не одна номинация. Ручные TypeScript-типы
 * (camelCase), не импортируются из `@/gen/**` — сериализуемая форма, которую
 * собирает BFF-слой (не забота этого файла).
 *
 * Переиспользует `FighterRef`/`BoutState` из `entities/pool/lib/types` — не
 * дублирует их поля (те же типы, что использует `BoardBout`).
 */

import type { FighterRef, BoutState } from "@/entities/pool/lib/types";

/** LiveArenaState — состояние площадки в публичной сводке (FR-14). */
export type LiveArenaState = "free" | "preparing" | "bout_in_progress";

/**
 * LiveNominationPhase — положение номинации в сайдбаре (FR-20): «скоро» /
 * «идёт» / «итоги». Собственная ось, не статус приёма заявок.
 */
export type LiveNominationPhase = "upcoming" | "running" | "finished";

/**
 * LiveFeedBoutDto — строка ленты боёв (FR-15/FR-16). Похож на `BoardBout`
 * (`fighterA`/`fighterB`/`state`/`scoreA`/`scoreB`) плюс контекст турнира
 * (номинация/этап/пул/площадка) и фактические отметки времени.
 *
 * `startedAt`/`finishedAt` — ISO-строки или `null`, если событие ещё не
 * произошло (FR-16: время в ленте фактическое, без прогноза).
 */
export type LiveFeedBoutDto = {
  boutId: string;
  nominationId: string;
  nominationName: string;
  stageTitle: string;
  poolName: string;
  arenaId: string;
  arenaName: string;
  sequenceNumber: number;
  poolBoutTotal: number;
  fighterA: FighterRef;
  fighterB: FighterRef;
  state: BoutState;
  scoreA: number;
  scoreB: number;
  startedAt: string | null;
  finishedAt: string | null;
};

/**
 * LiveArenaDto — карточка площадки (FR-14). `currentBout` — идущий бой у
 * `bout_in_progress`, первая непроведённая пара у `preparing`, `null` у
 * `free`.
 */
export type LiveArenaDto = {
  arenaId: string;
  arenaName: string;
  position: number;
  state: LiveArenaState;
  nominationId: string;
  nominationName: string;
  poolName: string;
  stageTitle: string;
  currentBout: LiveFeedBoutDto | null;
  poolBoutTotal: number;
  poolBoutFinished: number;
};

/** LiveNominationDto — строка сайдбара «Номинации» (FR-20). */
export type LiveNominationDto = {
  nominationId: string;
  title: string;
  position: number;
  phase: LiveNominationPhase;
  currentStageTitle: string;
  boutTotal: number;
  boutFinished: number;
  fighterCount: number;
};

/**
 * TournamentLiveSnapshotDto — сводка турнира целиком. `serverNowUnixMs` —
 * опора для «обновлено N сек назад» (как `ArenaLiveSnapshot`, спека 0033).
 */
export type TournamentLiveSnapshotDto = {
  tournamentId: string;
  arenas: LiveArenaDto[];
  bouts: LiveFeedBoutDto[];
  nominations: LiveNominationDto[];
  serverNowUnixMs: number;
};
