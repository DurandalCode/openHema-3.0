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
import type { ForecastDto } from "@/shared/lib/forecast-time";

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
  /**
   * forecast — ориентировочное время боя (спека 0043, ADR 0020), заполнено
   * только у не начатых боёв поставленного пула (FR-20/FR-24). Опционален
   * по тому же приёму, что `BoardBout.forecast` (`entities/pool/lib/types`)
   * — существующие фикстуры не обязаны его знать.
   */
  forecast?: ForecastDto;
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
  /**
   * nextBoutForecast — ориентировочное время СЛЕДУЮЩЕГО боя площадки
   * (спека 0043, FR-21): при `preparing` совпадает с `currentBout.forecast`
   * (сам `currentBout` и есть следующий бой); при `bout_in_progress` —
   * прогноз боя ПОСЛЕ идущего (у `currentBout` в этом состоянии своего
   * прогноза нет). `undefined`/`expectedStartAt: null` у `free` и когда не
   * осталось не начатых боёв.
   */
  nextBoutForecast?: ForecastDto;
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
 * опора для «обновлено N сек назад» (как `ArenaLiveSnapshot`, спека 0033);
 * `int64` в proto → `toJson` сериализует строкой (см. `ArenaLiveSnapshotDto`
 * в `entities/arena-live/lib/types.ts` — тот же приём), поэтому здесь тоже
 * `string`, а не `number`.
 */
export type TournamentLiveSnapshotDto = {
  tournamentId: string;
  arenas: LiveArenaDto[];
  bouts: LiveFeedBoutDto[];
  nominations: LiveNominationDto[];
  serverNowUnixMs: string;
};

/**
 * emptyTournamentLiveSnapshot — снапшот-заглушка (нет активного турнира,
 * либо gRPC упал при SSR) — по образцу `emptyNominationLiveSnapshot`
 * (`entities/nomination-live/lib/types.ts`). `tournamentPhase([])` на таком
 * снапшоте даёт `"before"` — безопасный дефолт для главной без турнира.
 */
export function emptyTournamentLiveSnapshot(tournamentId: string): TournamentLiveSnapshotDto {
  return {
    tournamentId,
    arenas: [],
    bouts: [],
    nominations: [],
    serverNowUnixMs: "0",
  };
}
