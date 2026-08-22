/**
 * Подписи блока «Площадки прямо сейчас» (спека 0034, FR-14, AC-7..AC-9).
 */

import type { LiveArenaDto, LiveArenaState } from "./types";

/** arenaStateLabel — человеческая подпись состояния площадки (RU). */
export function arenaStateLabel(state: LiveArenaState): string {
  switch (state) {
    case "bout_in_progress":
      return "идёт бой";
    case "preparing":
      return "готовится";
    case "free":
      return "свободна";
    default:
      return "—";
  }
}

/**
 * arenaSubtitle — что показать под названием площадки (FR-14):
 * `preparing`/`bout_in_progress` — номинация, этап, пул; `free` — пусто
 * (нечего показывать, правило 0001 «пустое поле скрывается»).
 */
export function arenaSubtitle(arena: LiveArenaDto): string {
  if (arena.state === "free") return "";
  return [arena.nominationName, arena.stageTitle, arena.poolName]
    .filter(Boolean)
    .join(" · ");
}
