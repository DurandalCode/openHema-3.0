/**
 * Счётчики полосы «идёт»/«завершён» (спека 0034, FR-12, FR-13).
 */

import type { LiveArenaDto, LiveFeedBoutDto } from "./types";

/** boutsDone — сколько боёв турнира завершено (FR-13). */
export function boutsDone(bouts: LiveFeedBoutDto[]): number {
  return bouts.filter((b) => b.state === "BOUT_STATE_FINISHED").length;
}

/** boutsTotal — сколько боёв турнира сформировано всего (FR-13). */
export function boutsTotal(bouts: LiveFeedBoutDto[]): number {
  return bouts.length;
}

/** arenasBusy — сколько площадок заняты (не `free`) (FR-13). */
export function arenasBusy(arenas: LiveArenaDto[]): number {
  return arenas.filter((a) => a.state !== "free").length;
}

/** arenasTotal — сколько площадок доступно всего (FR-13). */
export function arenasTotal(arenas: LiveArenaDto[]): number {
  return arenas.length;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * tournamentDayNumber — «день N» турнира (FR-12: «ДЕНЬ 2 · ИДЁТ»). `null`,
 * если `startAt` не задан. День считается календарно: разница в сутках
 * между календарным днём `now` и календарным днём `startAt`, плюс 1 (день
 * старта — «день 1», не «день 0»).
 *
 * Погранслучай (решение этого файла): эта функция вызывается только когда
 * турнир уже в фазе `running`/`finished` (см. `phase.ts`) — то есть хотя бы
 * один бой уже начат, а значит календарно `now` не может быть раньше
 * `startAt` в реальности. Но входные данные не запрещают такую комбинацию
 * (рассинхрон часовых поясов сервера/клиента, тестовые данные) — на этот
 * случай день клэмпится к 1, а не уходит в 0 или отрицательные значения:
 * отрицательный «день турнира» бессмысленнее всего для пользователя.
 */
export function tournamentDayNumber(
  startAt: string | null,
  now: Date,
): number | null {
  if (!startAt) return null;
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return null;

  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(start)) / MS_PER_DAY,
  );
  return Math.max(1, diffDays + 1);
}
