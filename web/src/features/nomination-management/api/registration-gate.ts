import type { NominationStatus } from "@/entities/nomination/lib/types";

/**
 * canClose/canReopen — чистые функции доступности кнопок «Закрыть/Открыть
 * приём» в админке (спека 0012, FR-9/AC-12/AC-16). Вынесены отдельно от
 * `nomination-management.tsx`, чтобы тестироваться без рендера компонента.
 *
 * UI намеренно не различает причину закрытия («manual» vs «drawing») —
 * `closed_reason` не выводится на фронт вообще (см. plan.md «Обзор решения»).
 * Единственное, что решает доступность «Открыть приём» при `CLOSED` —
 * `hasDistributedFighters`: сервер сам отклонит `ReopenRegistration`
 * (`FailedPrecondition`), если причина не «manual», но с точки зрения кнопки
 * этого достаточно — см. риски plan.md.
 */

/** canClose — «Закрыть приём» доступна только когда номинация открыта. */
export function canClose(status: NominationStatus): boolean {
  return status === "NOMINATION_STATUS_OPEN";
}

/**
 * canReopen — «Открыть приём» доступна только когда номинация закрыта и
 * сейчас нет ни одного распределённого бойца (раскладка не идёт).
 */
export function canReopen(status: NominationStatus, hasDistributedFighters: boolean): boolean {
  return status === "NOMINATION_STATUS_CLOSED" && !hasDistributedFighters;
}
