import type { PoolStatus } from "./types";

/** PoolTab — вкладка карточки группы (спека 0061). */
export type PoolTab = "bouts" | "standings";

/**
 * defaultPoolTab — вкладка карточки группы по умолчанию (спека 0061, FR-4):
 * «Бои» — только пока группа идёт; до начала боёв и после завершения —
 * «Рейтинг». Берётся статус самой группы, а не номинации.
 */
export function defaultPoolTab(status: PoolStatus): PoolTab {
  return status === "POOL_STATUS_ACTIVE" ? "bouts" : "standings";
}
