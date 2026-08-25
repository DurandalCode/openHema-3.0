import type { FighterStatus, ParticipationStatus, WithdrawalReason } from "./types";

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
