import type { StageBuildPreview } from "@/entities/stage/lib/types";
import { allTiesResolved } from "./tie-resolution";

/**
 * build-gate — единственный источник причины, по которой кнопка
 * «Сформировать» (0019 FR-15, 0032 FR-16) недоступна: пересечение веток
 * отбора (FR-11) или неразрешённые дележи (FR-22). Один и тот же результат
 * используется и как `disabled` кнопки, и как подпись рядом с ней — гейт и
 * объяснение никогда не расходятся (FR-16).
 *
 * Пересечение веток приоритетнее дележей: это структурная проблема схемы —
 * организатор не решит её кликами внутри диалога, нужно вернуться на схему
 * и сузить селекторы (FR-11), тогда как дележ разрешается прямо здесь.
 * `sourceUnfinishedBouts` (недоигранный источник, FR-14) сюда намеренно не
 * входит — это предупреждение, формирование остаётся доступным (AC-10).
 */
export function buildBlockedReason(preview: StageBuildPreview): string | null {
  if (preview.overlaps.length > 0) return "пока есть пересечение веток";
  if (preview.ties.length > 0 && !allTiesResolved(preview.ties, [])) {
    return "пока есть неразрешённые дележи";
  }
  return null;
}
