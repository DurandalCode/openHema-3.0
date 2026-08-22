/**
 * tournamentPhase — состояние турнира целиком (спека 0034, FR-1): «до
 * старта» / «идёт» / «завершён». Выводится чистой функцией из фаз номинаций
 * турнира, без ручного переключателя и без нового admin-действия.
 */

import type { LiveNominationDto, LiveNominationPhase } from "./types";

export type TournamentPhase = "before" | "running" | "finished";

/**
 * Правило (FR-1 + пограничный случай, решённый нами):
 * - нет номинаций, либо ни одна не начата (все `upcoming`) → `before`;
 * - есть хотя бы одна `running` → `running`;
 * - номинации есть и все `finished` → `finished`;
 * - смесь `upcoming`/`finished` без единой `running` (часть номинаций уже
 *   доиграна, часть ещё не стартовала, но ни одна не идёт прямо сейчас) —
 *   трактуем как `running`: хотя бы один бой турнира уже был (значит не
 *   «до старта», FR-1 определяет «до старта» как «ни один бой не начат»),
 *   а «завершён» по FR-1 требует, чтобы ВСЕ номинации были доиграны, что
 *   здесь не так. Это активный день турнира между номинациями, не пауза.
 */
export function tournamentPhase(
  nominations: LiveNominationDto[],
): TournamentPhase {
  if (nominations.length === 0) return "before";

  const phases = new Set<LiveNominationPhase>(nominations.map((n) => n.phase));

  if (phases.has("running")) return "running";
  if (phases.size === 1 && phases.has("upcoming")) return "before";
  if (phases.size === 1 && phases.has("finished")) return "finished";

  // Смешанный набор без running (upcoming + finished).
  return "running";
}
