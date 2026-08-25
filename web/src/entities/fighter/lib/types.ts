/**
 * Fighter — боец турнира: персона-участник, отвязанная от пользователей
 * системы (спека 0007). Имя/клуб — снапшот (из заявки при регистрации либо
 * введённые admin), не резолвятся на лету.
 *
 * Timestamp-поля приведены к ISO-строкам (как в entities/application),
 * `status`/`withdrawalReason`/`participations[].status` — к строковым
 * литералам.
 */

export type FighterStatus =
  | "FIGHTER_STATUS_UNSPECIFIED"
  | "FIGHTER_STATUS_ACTIVE"
  | "FIGHTER_STATUS_WITHDRAWN"
  // MERGED (спека 0040, FR-10): запись-источник после слияния дублей — не
  // удалена физически, `mergedIntoId` указывает на итоговую запись.
  | "FIGHTER_STATUS_MERGED";

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
  // fromApplication — боец появился регистрацией заявки (true) либо заведён
  // admin вручную (false). Признак, не идентификатор заявителя (спека 0026).
  fromApplication: boolean;
  // linkedAccountId (спека 0040, FR-8): id учётки пользователя, которой
  // привязан этот боец (через origin_user_id), "" либо не задано — нет
  // привязки. Поле заполняется ТОЛЬКО в admin-ответах (ADR 0016 не
  // расширяется). Опционально (а не просто ""): существующие потребители
  // типа `Fighter` (`lib/grpc/serialize.ts`, вне границ этого трека — общий
  // сериализатор для всех admin-ответов, правится в другом треке/join-волне)
  // ещё не заполняют его, строгая обязательность сломала бы их без пользы —
  // тот же приём, что `Pool.stageId` (`entities/pool/lib/types.ts`).
  linkedAccountId?: string;
  // linkedAccountDisplayName — отображаемое имя привязанной учётки (спека
  // 0040, FR-8), "" либо не задано — нет привязки либо учётка не резолвлена.
  linkedAccountDisplayName?: string;
  // mergedIntoId (спека 0040, FR-10): непусто, если `status =
  // "FIGHTER_STATUS_MERGED"` — id записи, в которую слит этот боец.
  mergedIntoId?: string;
};

/**
 * hasLinkedAccount — у бойца есть привязанная учётка пользователя (спека
 * 0040, FR-8): условие бейджа в ростере/карточке админки.
 */
export function hasLinkedAccount(fighter: Pick<Fighter, "linkedAccountId">): boolean {
  return Boolean(fighter.linkedAccountId);
}

/**
 * isMergedFighter — запись бойца объединена (дубль-источник после слияния,
 * спека 0040, FR-10): такая запись больше не фигурирует как отдельный
 * участник и не может выступать целью нового слияния/повторного слияния.
 */
export function isMergedFighter(status: FighterStatus): boolean {
  return status === "FIGHTER_STATUS_MERGED";
}

// RosterEntry — элемент публичного состава номинации. Без id: публичная
// выдача не раскрывает внутренние идентификаторы.
export type RosterEntry = {
  name: string;
  club: string;
  inRoster: boolean;
};
