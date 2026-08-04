/**
 * Человекочитаемые подписи состояний сетки (RU, спека 0018).
 */

import type { BracketSlot, BracketSlotState } from "./types";

/**
 * slotStateLabel — состояние слота как короткий статус-текст (бейдж):
 * занят, пуст либо ждёт соперника (FR-9/FR-13). Для содержательного текста
 * слота (имя бойца / «Бай» / подпись пары-источника) — `slotDisplayName`.
 */
export function slotStateLabel(state: BracketSlotState): string {
  switch (state) {
    case "BRACKET_SLOT_STATE_FILLED":
      return "занят";
    case "BRACKET_SLOT_STATE_EMPTY":
      return "пусто";
    case "BRACKET_SLOT_STATE_PENDING":
      return "ожидание";
    default:
      return "—";
  }
}

/**
 * slotDisplayName — основной текст слота сетки:
 * - `FILLED` — имя бойца;
 * - `PENDING` — подпись пары-источника, сформированная сервером
 *   («Победитель пары 3, 1/4 финала», FR-13) — клиент не собирает строку из
 *   чисел, только показывает готовую;
 * - `EMPTY` у уже разрешённой пары — «Бай» (FR-9): соперник проходит дальше
 *   без боя, недобор — законное состояние, а не ошибка отображения;
 * - `EMPTY` у ещё не разрешённой пары (посев не зафиксирован либо слот
 *   первого круга ещё не занят организатором) — прочерк: пара пока может
 *   получить бойца.
 */
export function slotDisplayName(slot: BracketSlot, pairResolved: boolean): string {
  switch (slot.state) {
    case "BRACKET_SLOT_STATE_FILLED":
      return slot.fighter.name;
    case "BRACKET_SLOT_STATE_PENDING":
      return slot.sourceLabel || "Ожидание соперника";
    case "BRACKET_SLOT_STATE_EMPTY":
      return pairResolved ? "Бай" : "—";
    default:
      return "—";
  }
}
