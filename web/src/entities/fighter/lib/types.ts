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
  // привязан этот боец (через origin_user_id), "" — нет привязки. Заполняет
  // общий `fighterToJson` (`lib/grpc/serialize.ts`) для ВСЕХ admin-ответов;
  // сервер отдаёт непустое значение ТОЛЬКО из FighterAdminService (ADR 0016
  // не расширяется — FighterPublicService/FighterService этого поля вообще
  // не сериализуют, см. серверный регресс-тест границы). Опционально, а не
  // просто "" — тот же приём, что `Pool.stageId` (`entities/pool/lib/types.ts`).
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

/**
 * Отчёт импорта ростера из файла (спека 0049): одна и та же форма у
 * предпросмотра (`dryRun: true`, ничего не записано — FR-2) и у результата
 * подтверждённого импорта (FR-10). Enum'ы proto приведены к строковым
 * литералам, как `FighterStatus` выше.
 */
export type ImportRowOutcome =
  | "IMPORT_ROW_OUTCOME_UNSPECIFIED"
  | "IMPORT_ROW_OUTCOME_CREATED"
  | "IMPORT_ROW_OUTCOME_UPDATED"
  | "IMPORT_ROW_OUTCOME_SKIPPED"
  | "IMPORT_ROW_OUTCOME_REJECTED";

export type ImportRowError =
  | "IMPORT_ROW_ERROR_UNSPECIFIED"
  | "IMPORT_ROW_ERROR_EMPTY_NAME"
  | "IMPORT_ROW_ERROR_UNKNOWN_NOMINATION"
  | "IMPORT_ROW_ERROR_FIGHTER_WITHDRAWN";

export type ImportRowReport = {
  // line — номер строки в файле, как её видит admin в редакторе, с учётом
  // строки заголовка (FR-11a): отчёт прикладывается к самому файлу.
  line: number;
  name: string;
  club: string;
  outcome: ImportRowOutcome;
  // nominationTitles — номинации строки как они записаны в файле; пусто,
  // если колонка пуста и сработало умолчание из UI (FR-5a).
  nominationTitles: string[];
  // addedNominationIds — участия, которые появятся (CREATED/UPDATED).
  addedNominationIds: string[];
  // fighterId — существующий боец для UPDATED/SKIPPED и для отклонения по
  // «боец выведен с турнира»; для CREATED в предпросмотре пуст.
  fighterId: string;
  error: ImportRowError;
  // errorDetail — уточнение причины: нераспознанное название номинации.
  errorDetail: string;
};

/** ImportSummary — сводка предпросмотра/отчёта (FR-4). */
export type ImportSummary = {
  rowsRead: number;
  created: number;
  updated: number;
  skipped: number;
  rejected: number;
};

export type ImportReport = {
  summary: ImportSummary;
  rows: ImportRowReport[];
  // dryRun — эхо запроса: предпросмотр (true) или уже записанный результат
  // (false). UI не должен их путать.
  dryRun: boolean;
};
