import type { ApplicationEvent, ApplicationEventType, ApplicationState } from "@/entities/application/lib/types";

/**
 * TEMPORARY JOIN-WAVE STUB (spec 0025, `docs/specs/0025-applications-redesign/tasks.md`
 * — «Трек C работает поверх локальных заглушек того, что делает трек B»,
 * same pattern as spec 0024).
 *
 * Track B (web-фундамент, `web/src/entities/application/lib/state.ts` +
 * `lib/types.ts`) is adding, in a parallel worktree not yet merged here:
 *   - `stateCaption`, `eventLabel`, `nextExpectedStep`, `isTerminal` to
 *     `entities/application/lib/state.ts` (T7);
 *   - `actorDisplayName: string` to the `ApplicationEvent` type (T7).
 *
 * Track C (this worktree) needs both before Track B lands, so this file
 * provides same-behavior stand-ins that Track C files import instead of the
 * entity module directly.
 *
 * AT JOIN TIME (tasks.md T15 — "подключить реальные импорты вместо заглушек
 * трека C"):
 *   1. Delete this file.
 *   2. Replace every `from "./state-stub"` / `from "../lib/state-stub"`
 *      import of `stateCaption`/`eventLabel`/`nextExpectedStep`/`isTerminal`
 *      with `from "@/entities/application/lib/state"`.
 *   3. Replace every use of the local `ApplicationEventWithActor` type
 *      (defined at the bottom of this file) with the plain
 *      `ApplicationEvent` type from `@/entities/application/lib/types`
 *      (it will carry `actorDisplayName` for real by then).
 *
 * Call sites today: `ui/application-row.tsx`, `ui/application-card-dialog.tsx`,
 * `lib/history.ts` (functions); `api/requests.ts`, `api/use-application-detail.ts`,
 * `lib/history.ts`, `ui/application-history.tsx`, `ui/application-card-dialog.tsx`
 * (the `ApplicationEventWithActor` type).
 */

/** stateCaption — короткая подпись состояния для подстроки строки (spec FR-2). */
export function stateCaption(state: ApplicationState): string {
  switch (state) {
    case "APPLICATION_STATE_SUBMITTED":
      return "подана";
    case "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION":
      return "оплата заявлена";
    case "APPLICATION_STATE_PAID":
      return "оплата подтверждена";
    case "APPLICATION_STATE_REGISTERED":
      return "зарегистрирован";
    case "APPLICATION_STATE_WITHDRAWN":
      return "отозвана";
    default:
      return "—";
  }
}

/** eventLabel — подпись события истории (spec FR-17), включая AMENDED. */
export function eventLabel(type: ApplicationEventType): string {
  switch (type) {
    case "APPLICATION_EVENT_TYPE_SUBMITTED":
      return "Подана";
    case "APPLICATION_EVENT_TYPE_PAYMENT_DECLARED":
      return "Оплата заявлена";
    case "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED":
      return "Оплата подтверждена";
    case "APPLICATION_EVENT_TYPE_FIGHTER_REGISTERED":
      return "Боец зарегистрирован";
    case "APPLICATION_EVENT_TYPE_WITHDRAWN":
      return "Отозвана";
    case "APPLICATION_EVENT_TYPE_AMENDED":
      return "Заявка изменена";
    default:
      return "—";
  }
}

/** isTerminal — терминальные состояния заявки (spec FR-3). */
export function isTerminal(state: ApplicationState): boolean {
  return state === "APPLICATION_STATE_REGISTERED" || state === "APPLICATION_STATE_WITHDRAWN";
}

/**
 * nextExpectedStep — ожидаемый следующий шаг для нетерминальной заявки, с
 * указанием, чьего действия ждём (spec FR-18); терминальные состояния →
 * `null`.
 */
export function nextExpectedStep(
  state: ApplicationState,
): { label: string; waitingOn: string } | null {
  switch (state) {
    case "APPLICATION_STATE_SUBMITTED":
      return { label: "Оплата заявлена", waitingOn: "ожидает отметки бойца" };
    case "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION":
      return { label: "Оплата подтверждена", waitingOn: "ожидает действия секретаря" };
    case "APPLICATION_STATE_PAID":
      return { label: "Боец зарегистрирован", waitingOn: "ожидает действия секретаря" };
    default:
      return null;
  }
}

/**
 * ApplicationEventWithActor — TEMPORARY: `ApplicationEvent` расширенный
 * полем `actorDisplayName` (см. заголовок файла). После join —
 * заменить на прямой импорт `ApplicationEvent` из
 * `@/entities/application/lib/types` (поле уже будет там).
 */
export type ApplicationEventWithActor = ApplicationEvent & { actorDisplayName: string };
