/**
 * stageProgressFromSnapshot — прогресс по бойцам/боям каждого этапа
 * номинации из живого снапшота (спека 0032, FR-18, NFR-5): чистая функция
 * для правого рельса страницы этапа. Бои адресуются пулами/парами сетки, а
 * не этапами напрямую — снапшот уже несёт всё нужное (`Pool.stageId`,
 * `Bracket.stage`), отдельный запрос на сервер не нужен.
 */

import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import { bracketRoundOneFilledCount } from "@/entities/bracket/lib/types";

export type StageProgress = {
  fighters: number;
  boutsTotal: number;
  boutsFinished: number;
};

/**
 * Этап без записи в снапшоте (черновик — `pools` пуст, пока раскладка
 * draft, и `brackets` пуст, пока сетка не зафиксирована) отсутствует в
 * результате: рельс показывает конфиг/статус без счётчиков, а не «0 из 0».
 */
export function stageProgressFromSnapshot(
  snapshot: NominationLiveSnapshotDto,
): Record<string, StageProgress> {
  const result: Record<string, StageProgress> = {};

  for (const { pool, bouts } of snapshot.pools) {
    const stageId = pool.stageId;
    if (!stageId) continue;
    const progress = (result[stageId] ??= { fighters: 0, boutsTotal: 0, boutsFinished: 0 });
    progress.fighters += pool.members.length;
    progress.boutsTotal += bouts.length;
    progress.boutsFinished += bouts.filter((b) => b.state === "BOUT_STATE_FINISHED").length;
  }

  for (const bracket of snapshot.brackets) {
    const stageId = bracket.stage.id;
    const progress = (result[stageId] ??= { fighters: 0, boutsTotal: 0, boutsFinished: 0 });

    progress.fighters += bracketRoundOneFilledCount(bracket);

    for (const round of bracket.rounds) {
      for (const half of round.halves) {
        for (const pair of half.pairs) {
          if (!pair.bout) continue;
          progress.boutsTotal += 1;
          if (pair.bout.state === "BOUT_STATE_FINISHED") progress.boutsFinished += 1;
        }
      }
    }
  }

  return result;
}
