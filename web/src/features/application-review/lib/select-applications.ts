import { allowedSecretaryActions, type SecretaryAction } from "@/entities/application/lib/state";
import type { Application, ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";

/**
 * QUEUE_ORDER — детерминированный порядок групп очереди (spec FR-6, AC-1):
 * сначала состояния, требующие действия секретаря («ожидает подтверждения»,
 * затем «оплачена» — каждое своей подгруппой), затем «подана» (ждём бойца),
 * затем терминальные состояния (REGISTERED/WITHDRAWN — единая справочная
 * группа в конце).
 */
const QUEUE_ORDER: Record<ApplicationState, number> = {
  APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION: 0,
  APPLICATION_STATE_PAID: 1,
  APPLICATION_STATE_SUBMITTED: 2,
  APPLICATION_STATE_REGISTERED: 3,
  APPLICATION_STATE_WITHDRAWN: 3,
  APPLICATION_STATE_UNSPECIFIED: 4,
};

/**
 * sortApplications — порядок очереди на разбор (spec FR-6/AC-1): сначала
 * заявки, ждущие действия секретаря (сначала «ожидает подтверждения»,
 * потом «оплачена»), затем ждущие бойца («подана»), затем терминальные;
 * внутри группы — от старых к новым по `updatedAt`. Не мутирует вход.
 */
export function sortApplications(apps: Application[]): Application[] {
  return [...apps].sort((a, b) => {
    const groupDiff = QUEUE_ORDER[a.state] - QUEUE_ORDER[b.state];
    if (groupDiff !== 0) return groupDiff;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });
}

export type ApplicationStatusCount = { status: ApplicationState; count: number };

export type StatusCounts = Record<ApplicationState, number>;

const EMPTY_STATUS_COUNTS: StatusCounts = {
  APPLICATION_STATE_UNSPECIFIED: 0,
  APPLICATION_STATE_SUBMITTED: 0,
  APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION: 0,
  APPLICATION_STATE_PAID: 0,
  APPLICATION_STATE_REGISTERED: 0,
  APPLICATION_STATE_WITHDRAWN: 0,
};

/**
 * toStatusCountsRecord — приводит счётчики по статусу, посчитанные сервером
 * по ВСЕМ заявкам турнира вне зависимости от фильтра/поиска (спека 0041,
 * FR-4, `ListApplicationsResponse.status_counts`), к `Record`, который ждёт
 * `ApplicationsFilters`. Замена клиентской `statusCounts` (спека 0025) —
 * подсчёт по полному списку переехал на сервер вместе с фильтрацией/поиском
 * (план 0041, «Web»); эта функция только меняет форму уже готового счёта.
 */
export function toStatusCountsRecord(counts: ApplicationStatusCount[]): StatusCounts {
  const result = { ...EMPTY_STATUS_COUNTS };
  for (const c of counts) result[c.status] = c.count;
  return result;
}

/**
 * overfullNominationIds — номинации, где число уже зарегистрированных
 * бойцов не меньше лимита (spec FR-4). Зеркалит серверное правило
 * `capacityExceeded` (`server/modules/application/service/service.go`):
 * сравнение `>=`, не `>`; лимит не задан (`null`) → номинация пропускается.
 *
 * Считается по уже загруженному списку заявок — с переносом поиска/фильтра
 * на сервер (спека 0041) вызывающая сторона (`ApplicationsScreen`) передаёт
 * сюда только текущую СТРАНИЦУ, не весь список турнира (полный список больше
 * не загружается на клиент — в этом и цель 0041/NFR-1). Деградация та же,
 * что была задокументирована и раньше, только шире: признак «переполнена»
 * может не появиться, если зарегистрированные заявки номинации не попали на
 * текущую страницу (false negative), но не появится ложно (false positive
 * невозможен — считаем только по тому, что реально видим).
 */
export function overfullNominationIds(
  apps: Application[],
  nominations: Nomination[],
): Set<string> {
  const registeredCounts = new Map<string, number>();
  for (const app of apps) {
    if (app.state !== "APPLICATION_STATE_REGISTERED") continue;
    registeredCounts.set(app.nominationId, (registeredCounts.get(app.nominationId) ?? 0) + 1);
  }

  const result = new Set<string>();
  for (const nomination of nominations) {
    if (nomination.fighterCapacity === null) continue;
    const count = registeredCounts.get(nomination.id) ?? 0;
    if (count >= nomination.fighterCapacity) result.add(nomination.id);
  }
  return result;
}

export type RowAction = { kind: "action"; action: SecretaryAction } | { kind: "reason"; reason: string };

/**
 * rowAction — какое действие флоу доступно из строки таблицы (spec FR-5),
 * либо текст-причина, если действия нет. Обёртка над
 * `allowedSecretaryActions` (домен-зеркало, entities/application/lib/state)
 * — источник истины по допустимым переходам остаётся там.
 */
export function rowAction(state: ApplicationState): RowAction {
  const actions = allowedSecretaryActions(state);
  if (actions.includes("confirmPayment")) return { kind: "action", action: "confirmPayment" };
  if (actions.includes("register")) return { kind: "action", action: "register" };

  switch (state) {
    case "APPLICATION_STATE_SUBMITTED":
      return { kind: "reason", reason: "ждём отметку об оплате от бойца" };
    case "APPLICATION_STATE_REGISTERED":
      return { kind: "reason", reason: "терминально · зарегистрирована" };
    case "APPLICATION_STATE_WITHDRAWN":
      return { kind: "reason", reason: "терминально · отозвана" };
    default:
      return { kind: "reason", reason: "—" };
  }
}
