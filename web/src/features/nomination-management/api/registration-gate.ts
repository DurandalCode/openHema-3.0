import type { NominationStatus } from "@/entities/nomination/lib/types";

/**
 * canClose/canReopen/reopenBlockedReason/registrationErrorMessage — чистые
 * функции гейта «Закрыть/Открыть приём» в админке (спека 0012, FR-9/AC-12;
 * спека 0028, FR-13/FR-14/FR-17). Вынесены отдельно от UI, чтобы
 * тестироваться без рендера компонента.
 *
 * До 0028 клиентский гейт «Открыть приём» подглядывал в срез раскладки пулов
 * (`hasDistributedFighters`) через ручку `pool-status` — та ручка удалена
 * ещё в 0017 и запрос на неё всегда отвечал 404 (мёртвый код, T3). Теперь
 * единственный клиентский гейт — `status` номинации; окончательное решение,
 * можно ли переоткрыть приём (закрытие было ручным и раскладка не началась,
 * 0012 FR-4), остаётся за сервером — отказ приходит `FailedPrecondition`
 * (→ HTTP 409). `registrationErrorMessage` переводит именно этот код в
 * фиксированную русскую формулировку, не разбирая текст ошибки сервера:
 * дешевле и устойчивее сравнения строк (см. риски plan.md).
 */

/** canClose — «Закрыть приём» доступна только когда номинация открыта. */
export function canClose(status: NominationStatus): boolean {
  return status === "NOMINATION_STATUS_OPEN";
}

/** canReopen — «Открыть приём» доступна только когда номинация закрыта. */
export function canReopen(status: NominationStatus): boolean {
  return status === "NOMINATION_STATUS_CLOSED";
}

/**
 * reopenBlockedReason — почему «Открыть приём» недоступно в исполнительной
 * фазе турнира (спека 0028, FR-13/AC-10): открытие приёма посреди турнира
 * сломало бы уже сформированные составы. Для остальных статусов (в т.ч.
 * `OPEN`/`CLOSED`) объяснять нечего — `null`.
 */
export function reopenBlockedReason(status: NominationStatus): string | null {
  return status === "NOMINATION_STATUS_ACTIVE" || status === "NOMINATION_STATUS_FINISHED"
    ? "Бои уже начались — открыть приём нельзя"
    : null;
}

const REOPEN_CONFLICT_MESSAGE =
  "Открыть приём нельзя: приём закрылся автоматически при посеве либо в номинации уже есть распределённые бойцы — сначала расформируйте состав этапа";

/**
 * registrationErrorMessage — переводит отказ сервера в переоткрытии приёма
 * (спека 0028, FR-14/AC-11) в русский текст. 409 — единственный код, для
 * которого причина известна и переводится; остальное (в т.ч. отсутствие
 * статуса — сетевая ошибка) передаётся как есть — сервер/BFF уже отдают
 * разумный текст.
 */
export function registrationErrorMessage(error: string, status?: number): string {
  return status === 409 ? REOPEN_CONFLICT_MESSAGE : error;
}
