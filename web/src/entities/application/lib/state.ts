import type { ApplicationState } from "@/entities/application/lib/types";

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
