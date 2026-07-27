/**
 * Живой снапшот номинации (спека 0014): пулы готовой раскладки с
 * исполнительным статусом/площадкой и их бои с состоянием/счётом/текущим
 * боём. Переиспользует существующие DTO `entities/pool` (`Pool`/`BoardBout`)
 * — не дублирует их поля.
 */

import type { Pool, BoardBout } from "@/entities/pool/lib/types";

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
 * пока раскладка номинации в `draft` (FR-12, как `ListPublicPools`).
 */
export type NominationLiveSnapshotDto = {
  nominationId: string;
  pools: LivePoolDto[];
};

/** emptyNominationLiveSnapshot — безопасный фолбэк (ошибка gRPC/draft). */
export function emptyNominationLiveSnapshot(nominationId: string): NominationLiveSnapshotDto {
  return { nominationId, pools: [] };
}
