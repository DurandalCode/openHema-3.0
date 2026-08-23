/**
 * my-view — проекция «моего» из живой сводки турнира (спека 0038, ADR 0016):
 * чистые функции над уже загруженным `TournamentLiveSnapshotDto` (0034), без
 * отдельного серверного запроса — свой `fighterId` приходит от
 * `FighterService.GetMyFighter` (`entities/fighter/model/get-my-fighter.ts`),
 * дальше фильтрация полностью на клиенте.
 */

import { outcomeOf } from "@/entities/pool/lib/types";
import type { LiveFeedBoutDto } from "./types";

/** myBouts — бои, где боец участвует любой из сторон. */
export function myBouts(bouts: LiveFeedBoutDto[], fighterId: string): LiveFeedBoutDto[] {
  return bouts.filter(
    (b) => b.fighterA.fighterId === fighterId || b.fighterB.fighterId === fighterId,
  );
}

/**
 * nextBout — ближайший бой бойца (FR-33): идущий, если есть, иначе первый
 * не начатый по `sequenceNumber`. `null`, если у бойца нет боёв вовсе.
 */
export function nextBout(bouts: LiveFeedBoutDto[], fighterId: string): LiveFeedBoutDto | null {
  const mine = myBouts(bouts, fighterId);

  const inProgress = mine.find((b) => b.state === "BOUT_STATE_IN_PROGRESS");
  if (inProgress) return inProgress;

  const notStarted = mine
    .filter((b) => b.state === "BOUT_STATE_NOT_STARTED")
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return notStarted[0] ?? null;
}

/**
 * containerKey — группировка боёв по контейнеру (пул/половина круга).
 * `nominationId` + `poolName`: одноимённые пулы разных номинаций не должны
 * схлопываться в один контейнер.
 */
function containerKey(bout: LiveFeedBoutDto): string {
  return `${bout.nominationId}::${bout.poolName}`;
}

/**
 * boutsUntil — сколько ещё не начатых боёв того же контейнера стоит перед
 * `target` (FR-33, «через N боёв» — счёт боёв, не времени, FR-34 отклоняет
 * прогноз времени). Для идущего боя — 0: он уже не в очереди, а происходит
 * сейчас.
 */
export function boutsUntil(bouts: LiveFeedBoutDto[], target: LiveFeedBoutDto): number {
  if (target.state !== "BOUT_STATE_NOT_STARTED") return 0;

  return bouts.filter(
    (b) =>
      containerKey(b) === containerKey(target) &&
      b.state === "BOUT_STATE_NOT_STARTED" &&
      b.sequenceNumber < target.sequenceNumber,
  ).length;
}

export type MyNominationProgress = {
  containerName: string;
  done: number;
  total: number;
  wins: number;
  losses: number;
  draws: number;
};

/**
 * myNominationProgress — прогресс бойца в одной номинации (FR-31/FR-32):
 * `done`/`total` — по ВСЕМ боям контейнера (например «2 из 5 боёв
 * проведено»), `wins`/`losses`/`draws` — только по личным завершённым боям.
 * `null`, если у бойца ещё нет ни одного боя в этой номинации в снапшоте —
 * это «раскладка ещё не готова» (FR-32), решает вызывающий виджет.
 */
export function myNominationProgress(
  bouts: LiveFeedBoutDto[],
  fighterId: string,
  nominationId: string,
): MyNominationProgress | null {
  const myNomBouts = myBouts(bouts, fighterId).filter((b) => b.nominationId === nominationId);
  if (myNomBouts.length === 0) return null;

  const containerName = myNomBouts[0].poolName;
  const containerBouts = bouts.filter(
    (b) => b.nominationId === nominationId && b.poolName === containerName,
  );
  const done = containerBouts.filter((b) => b.state === "BOUT_STATE_FINISHED").length;
  const total = containerBouts.length;

  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const b of myNomBouts) {
    if (b.state !== "BOUT_STATE_FINISHED") continue;
    const outcome = outcomeOf(b.scoreA, b.scoreB);
    const iAmA = b.fighterA.fighterId === fighterId;
    if (outcome === "draw") draws += 1;
    else if ((outcome === "A") === iAmA) wins += 1;
    else losses += 1;
  }

  return { containerName, done, total, wins, losses, draws };
}
