import type {
  FighterStatus,
  ImportRowError,
  ImportRowOutcome,
  ParticipationStatus,
  WithdrawalReason,
} from "./types";

/** fighterStatusLabel — отображаемая подпись статуса бойца (spec FR-3). */
export function fighterStatusLabel(status: FighterStatus): string {
  switch (status) {
    case "FIGHTER_STATUS_ACTIVE":
      return "Активен";
    case "FIGHTER_STATUS_WITHDRAWN":
      return "Выбыл";
    case "FIGHTER_STATUS_MERGED":
      return "Объединён";
    default:
      return "—";
  }
}

/**
 * withdrawalReasonLabel — причина вывода (spec FR-3): `null`, пока боец
 * активен (`UNSPECIFIED`) — вызывающая сторона решает, показывать ли что-то
 * в этом случае вовсе.
 */
export function withdrawalReasonLabel(reason: WithdrawalReason): string | null {
  switch (reason) {
    case "WITHDRAWAL_REASON_INJURY":
      return "травма";
    case "WITHDRAWAL_REASON_BAN":
      return "бан";
    case "WITHDRAWAL_REASON_OTHER":
      return "иное";
    default:
      return null;
  }
}

/** participationLabel — статус участия в номинации (spec FR-2). */
export function participationLabel(status: ParticipationStatus): string {
  switch (status) {
    case "PARTICIPATION_STATUS_ACTIVE":
      return "участвует";
    case "PARTICIPATION_STATUS_REMOVED":
      return "снят";
    default:
      return "—";
  }
}

/** originLabel — происхождение бойца (spec FR-5): из заявки / заведён вручную. */
export function originLabel(fromApplication: boolean): string {
  return fromApplication ? "из заявки" : "заведён вручную";
}

/** importOutcomeLabel — исход строки файла при импорте (спека 0049, FR-3). */
export function importOutcomeLabel(outcome: ImportRowOutcome): string {
  switch (outcome) {
    case "IMPORT_ROW_OUTCOME_CREATED":
      return "новый боец";
    case "IMPORT_ROW_OUTCOME_UPDATED":
      return "дополнение";
    case "IMPORT_ROW_OUTCOME_SKIPPED":
      return "пропуск";
    case "IMPORT_ROW_OUTCOME_REJECTED":
      return "ошибка";
    default:
      return "—";
  }
}

/**
 * importRowErrorLabel — причина отклонения строки (спека 0049,
 * FR-5/FR-6/FR-8a). `null` для непринятой строки не бывает: `null` — это
 * «строка не отклонена», и вызывающая сторона сама решает, показывать ли
 * что-то в этом случае (как `withdrawalReasonLabel`).
 *
 * `detail` — само нераспознанное название номинации (AC-3): без него отчёт
 * не приложить к файлу.
 */
export function importRowErrorLabel(error: ImportRowError, detail = ""): string | null {
  switch (error) {
    case "IMPORT_ROW_ERROR_EMPTY_NAME":
      return "пустое имя";
    case "IMPORT_ROW_ERROR_UNKNOWN_NOMINATION":
      return detail ? `неизвестная номинация: ${detail}` : "неизвестная номинация";
    case "IMPORT_ROW_ERROR_FIGHTER_WITHDRAWN":
      return "боец выведен с турнира";
    default:
      return null;
  }
}
