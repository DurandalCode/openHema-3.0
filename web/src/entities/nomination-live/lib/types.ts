/**
 * Живой снапшот номинации (спека 0014): пулы готовой раскладки с
 * исполнительным статусом/площадкой и их бои с состоянием/счётом/текущим
 * боём. Переиспользует существующие DTO `entities/pool` (`Pool`/`BoardBout`)
 * — не дублирует их поля.
 */

import type { Pool, BoardBout } from "@/entities/pool/lib/types";
import type { Stage } from "@/entities/stage/lib/types";
import type { Bracket } from "@/entities/bracket/lib/types";
import type { NominationResults } from "@/entities/nomination-results/lib/types";
import { emptyNominationResults } from "@/entities/nomination-results/lib/types";

export { outcomeOf } from "@/entities/pool/lib/types";

/**
 * LivePoolDto — один пул живого снапшота: сам пул (состав/статус/площадка)
 * + его бои по порядку проведения + id эффективного текущего боя (пусто,
 * если у пула нет боёв).
 */
export type LivePoolDto = {
  pool: Pool;
  bouts: BoardBout[];
  currentBoutId: string;
};

/**
 * NominationLiveSnapshotDto — живой снапшот номинации целиком. `pools` пуст,
 * пока раскладка номинации в `draft` (FR-12, как `ListPublicPools`). `stages`
 * — этапы номинации (спека 0017, FR-11): подпись состава пулов на публичном
 * экране. Ровно один элемент в этом инкременте; `repeated` сразу — модель
 * допускает несколько (FR-2). `brackets` — плейофф-сетки номинации (спека
 * 0018, FR-19): read-only проекция для публичного экрана, рендерится рядом с
 * группами через `widgets/bracket-view`. `results` — итоговый протокол
 * номинации (спека 0021, FR-18): едет тем же живым каналом, чтобы призёры
 * появлялись на публичной странице без перезагрузки в момент завершения
 * последнего боя.
 */
export type NominationLiveSnapshotDto = {
  nominationId: string;
  pools: LivePoolDto[];
  stages: Stage[];
  brackets: Bracket[];
  results: NominationResults;
};

/** emptyNominationLiveSnapshot — безопасный фолбэк (ошибка gRPC/draft). */
export function emptyNominationLiveSnapshot(nominationId: string): NominationLiveSnapshotDto {
  return { nominationId, pools: [], stages: [], brackets: [], results: emptyNominationResults(nominationId) };
}
