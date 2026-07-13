/**
 * Fighter — боец турнира: персона-участник, отвязанная от пользователей
 * системы (спека 0007). Имя/клуб — снапшот (из заявки при регистрации либо
 * введённые admin), не резолвятся на лету.
 *
 * Timestamp-поля приведены к ISO-строкам (как в entities/application),
 * `status`/`withdrawalReason`/`participations[].status` — к строковым
 * литералам.
 */

export type FighterStatus = "FIGHTER_STATUS_UNSPECIFIED" | "FIGHTER_STATUS_ACTIVE" | "FIGHTER_STATUS_WITHDRAWN";

export type WithdrawalReason =
  | "WITHDRAWAL_REASON_UNSPECIFIED"
  | "WITHDRAWAL_REASON_INJURY"
  | "WITHDRAWAL_REASON_BAN"
  | "WITHDRAWAL_REASON_OTHER";

export type ParticipationStatus =
  | "PARTICIPATION_STATUS_UNSPECIFIED"
  | "PARTICIPATION_STATUS_ACTIVE"
  | "PARTICIPATION_STATUS_REMOVED";

export type Participation = {
  nominationId: string;
  status: ParticipationStatus;
};

export type Fighter = {
  id: string;
  tournamentId: string;
  name: string;
  club: string;
  status: FighterStatus;
  withdrawalReason: WithdrawalReason;
  participations: Participation[];
  createdAt: string;
  updatedAt: string;
};

// RosterEntry — элемент публичного состава номинации. Без id: публичная
// выдача не раскрывает внутренние идентификаторы.
export type RosterEntry = {
  name: string;
  club: string;
  inRoster: boolean;
};
