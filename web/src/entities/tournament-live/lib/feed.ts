/**
 * Лента боёв дня (спека 0034, FR-15..FR-18). Чистые функции: порядок
 * ленты и его фильтр не приходят с сервера (см. `plan.md`, риск «порядок
 * ленты считается на клиенте») — считаются здесь, дёшево тестируются.
 */

import { outcomeOf } from "@/entities/pool/lib/types";
import type { LiveFeedBoutDto } from "./types";

/**
 * sortFeed — порядок ленты (FR-17): идущие → готовящиеся/в очереди (по
 * `sequenceNumber`) → завершённые (свежие вперёд, по `finishedAt` убыв.).
 * Не мутирует вход.
 */
export function sortFeed(bouts: LiveFeedBoutDto[]): LiveFeedBoutDto[] {
  const inProgress = bouts.filter((b) => b.state === "BOUT_STATE_IN_PROGRESS");
  const notStarted = bouts
    .filter((b) => b.state === "BOUT_STATE_NOT_STARTED")
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const finished = bouts
    .filter((b) => b.state === "BOUT_STATE_FINISHED")
    .sort((a, b) => {
      const at = a.finishedAt ? Date.parse(a.finishedAt) : 0;
      const bt = b.finishedAt ? Date.parse(b.finishedAt) : 0;
      return bt - at;
    });

  return [...inProgress, ...notStarted, ...finished];
}

/** filterFeed — фильтр ленты по номинации (FR-18); `null`/`""` = все. */
export function filterFeed(
  bouts: LiveFeedBoutDto[],
  nominationId: string | null,
): LiveFeedBoutDto[] {
  if (!nominationId) return bouts;
  return bouts.filter((b) => b.nominationId === nominationId);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * boutTimeLabel — время в ленте (FR-16, AC-11..AC-13): для идущего боя —
 * время начала, для завершённого — время завершения, для не начатого —
 * прочерк («—», решение этого файла: пустая строка выглядела бы как
 * отсутствующая ячейка таблицы, прочерк явно говорит «данных нет»).
 * Никакого прогноза: если нужной отметки времени нет — тоже прочерк.
 *
 * Смотрит только на `state` (не хранит собственную память о прошлом
 * кадре) — поэтому переоткрытый бой (AC-14) сразу показывает `startedAt`,
 * а не унаследованный `finishedAt`.
 */
export function boutTimeLabel(bout: LiveFeedBoutDto): string {
  if (bout.state === "BOUT_STATE_IN_PROGRESS") {
    return bout.startedAt ? formatTime(bout.startedAt) : "—";
  }
  if (bout.state === "BOUT_STATE_FINISHED") {
    return bout.finishedAt ? formatTime(bout.finishedAt) : "—";
  }
  return "—";
}

/**
 * boutOutcomeLabel — итог боя (FR-15): имя победителя или «ничья», только
 * для завершённых боёв. `null` для остальных состояний.
 */
export function boutOutcomeLabel(bout: LiveFeedBoutDto): string | null {
  if (bout.state !== "BOUT_STATE_FINISHED") return null;

  const outcome = outcomeOf(bout.scoreA, bout.scoreB);
  if (outcome === "A") return bout.fighterA.name;
  if (outcome === "B") return bout.fighterB.name;
  return "ничья";
}
