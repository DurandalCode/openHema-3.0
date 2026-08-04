export type DropAction =
  | { type: "seed"; fighterId: string; slot: number }
  | { type: "clear"; slot: number }
  | { type: "noop" };

/**
 * resolveDrop — решает, какой запрос отправить по результату DnD в посеве
 * сетки (спека 0018, FR-7/FR-8): в слот (пустой или занятый — сервер сам
 * решает обмен местами или `ErrSlotOccupied`) → посадить; в нераспределённые
 * из слота → освободить исходный слот; тот же слот или боец не найден в
 * событии → no-op.
 */
export function resolveDrop(
  fighterId: string | undefined,
  fromSlot: number | null,
  toSlot: number | null,
): DropAction {
  if (!fighterId) return { type: "noop" };
  if (toSlot === fromSlot) return { type: "noop" };
  if (toSlot === null) {
    return fromSlot === null ? { type: "noop" } : { type: "clear", slot: fromSlot };
  }
  return { type: "seed", fighterId, slot: toSlot };
}
