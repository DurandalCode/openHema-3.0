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

export type ApplicationFilters = {
  statuses?: Set<ApplicationState>;
  nominationIds?: Set<string>;
  needsEquipment?: boolean;
  query?: string;
};

/**
 * filterApplications — статусы/номинации: пустой набор = без фильтра, иначе
 * множественный выбор внутри измерения (ИЛИ); `needsEquipment` — точечный
 * флаг; `query` — регистронезависимая подстрока по имени заявителя ИЛИ
 * клубу. Все измерения объединяются логическим И (spec FR-8/FR-9/FR-10).
 */
export function filterApplications(
  apps: Application[],
  { statuses, nominationIds, needsEquipment, query }: ApplicationFilters,
): Application[] {
  const q = (query ?? "").trim().toLowerCase();
  return apps.filter((app) => {
    if (statuses && statuses.size > 0 && !statuses.has(app.state)) return false;
    if (nominationIds && nominationIds.size > 0 && !nominationIds.has(app.nominationId)) return false;
    if (needsEquipment && !app.needsEquipment) return false;
    if (
      q !== "" &&
      !app.applicantDisplayName.toLowerCase().includes(q) &&
      !app.club.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export type StatusCounts = Record<ApplicationState, number>;

/**
 * statusCounts — счётчики по ВСЕМУ списку (spec FR-7/AC-2): вызывающая
 * сторона обязана передавать полный, не отфильтрованный по поиску/фильтрам
 * список — иначе счётчики чипов начнут зависеть от собственного же выбора.
 */
export function statusCounts(apps: Application[]): StatusCounts {
  const counts: StatusCounts = {
    APPLICATION_STATE_UNSPECIFIED: 0,
    APPLICATION_STATE_SUBMITTED: 0,
    APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION: 0,
    APPLICATION_STATE_PAID: 0,
    APPLICATION_STATE_REGISTERED: 0,
    APPLICATION_STATE_WITHDRAWN: 0,
  };
  for (const app of apps) counts[app.state] += 1;
  return counts;
}

/**
 * overfullNominationIds — номинации, где число уже зарегистрированных
 * бойцов не меньше лимита (spec FR-4). Зеркалит серверное правило
 * `capacityExceeded` (`server/modules/application/service/service.go`):
 * сравнение `>=`, не `>`; лимит не задан (`null`) → номинация пропускается.
 * Считается по уже загруженному списку заявок — известный предел (см.
 * plan.md «Риски»): деградация безопасная (признак может не появиться, но
 * не появится ложно).
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
