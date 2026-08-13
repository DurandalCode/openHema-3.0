import type {
  ApplicationEventType,
  ApplicationState,
} from "@/entities/application/lib/types";

export type ApplicantAction = "declarePayment" | "withdraw";
export type SecretaryAction = "confirmPayment" | "register";

/**
 * allowedApplicantActions — зеркало доменной state machine заявки (спека
 * 0005) на клиенте: какие действия заявителя доступны из текущего состояния.
 * Используется только для гейтинга кнопок UI — источник истины остаётся на
 * сервере (домен решает окончательно).
 */
export function allowedApplicantActions(state: ApplicationState): ApplicantAction[] {
  switch (state) {
    case "APPLICATION_STATE_SUBMITTED":
      return ["declarePayment", "withdraw"];
    case "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION":
    case "APPLICATION_STATE_PAID":
      return ["withdraw"];
    default:
      return [];
  }
}

/** allowedSecretaryActions — то же самое для действий секретаря/admin. */
export function allowedSecretaryActions(state: ApplicationState): SecretaryAction[] {
  switch (state) {
    case "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION":
      return ["confirmPayment"];
    case "APPLICATION_STATE_PAID":
      return ["register"];
    default:
      return [];
  }
}

/** stateLabel — отображаемая подпись состояния заявки (RU). */
export function stateLabel(state: ApplicationState): string {
  switch (state) {
    case "APPLICATION_STATE_SUBMITTED":
      return "Подана";
    case "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION":
      return "Ожидает подтверждения оплаты";
    case "APPLICATION_STATE_PAID":
      return "Оплачена";
    case "APPLICATION_STATE_REGISTERED":
      return "Зарегистрирована";
    case "APPLICATION_STATE_WITHDRAWN":
      return "Отозвана";
    default:
      return "—";
  }
}

/**
 * stateCaption — короткая формулировка состояния для подстроки строки
 * таблицы (спека 0025, FR-2): «подана 18 мар», «оплата заявлена 19 мар» и
 * т.д. — само слово состояния, дату дописывает вызывающий код.
 */
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

/** eventLabel — подпись события истории заявки (спека 0025, FR-17). */
export function eventLabel(type: ApplicationEventType): string {
  switch (type) {
    case "APPLICATION_EVENT_TYPE_SUBMITTED":
      return "Заявка подана";
    case "APPLICATION_EVENT_TYPE_PAYMENT_DECLARED":
      return "Оплата заявлена";
    case "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED":
      return "Оплата подтверждена";
    case "APPLICATION_EVENT_TYPE_FIGHTER_REGISTERED":
      return "Боец зарегистрирован";
    case "APPLICATION_EVENT_TYPE_WITHDRAWN":
      return "Заявка отозвана";
    case "APPLICATION_EVENT_TYPE_AMENDED":
      return "Заявка изменена";
    default:
      return "—";
  }
}

/**
 * nextExpectedStep — приглушённый ожидаемый следующий шаг для нетерминальной
 * заявки (спека 0025, FR-18): что должно произойти дальше и чьего действия
 * ждём. Для терминальных состояний (REGISTERED, WITHDRAWN) шага нет — `null`.
 */
export function nextExpectedStep(
  state: ApplicationState,
): { label: string; waitingOn: string } | null {
  switch (state) {
    case "APPLICATION_STATE_SUBMITTED":
      return {
        label: "Оплата заявлена — ожидает отметки бойца",
        waitingOn: "боец",
      };
    case "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION":
      return {
        label: "Оплата подтверждена — ожидает действия секретаря",
        waitingOn: "секретарь/организатор",
      };
    case "APPLICATION_STATE_PAID":
      return {
        label: "Боец зарегистрирован — ожидает действия секретаря",
        waitingOn: "секретарь/организатор",
      };
    default:
      return null;
  }
}

/** isTerminal — терминальное ли состояние заявки (спека 0025, FR-3). */
export function isTerminal(state: ApplicationState): boolean {
  return (
    state === "APPLICATION_STATE_REGISTERED" ||
    state === "APPLICATION_STATE_WITHDRAWN"
  );
}
