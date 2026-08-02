/**
 * Пулы номинации — раскладка бойцов по группам (спека 0009) и статус
 * отдельного пула (спека 0011).
 *
 * Сериализуемая форма (без bigint/Date), status — строковый литерал. Имя
 * пула («Пул N») генерируется сервером из number, не хранится отдельно и не
 * редактируется.
 */

/**
 * PoolLayoutStatus — статус раскладки номинации целиком (спека 0009,
 * урезан спекой 0011 до двух значений: `active/finished` были заглушкой
 * «на будущие бои», исполнительная фаза теперь на отдельном пуле, см.
 * `PoolStatus`).
 */
export type PoolLayoutStatus =
  | "POOL_LAYOUT_STATUS_UNSPECIFIED"
  | "POOL_LAYOUT_STATUS_DRAFT"
  | "POOL_LAYOUT_STATUS_READY";

/**
 * PoolStatus — статус отдельного пула (спека 0011, FR-1). `NOT_READY`/`READY`
 * синхронны со статусом раскладки номинации; `PREPARING` — пул поставлен на
 * арену (готовится к запуску). `ACTIVE`/`FINISHED` — задел под будущий ЖЦ
 * боя (ЕДД), в этом инкременте не достигаются.
 */
export type PoolStatus =
  | "POOL_STATUS_UNSPECIFIED"
  | "POOL_STATUS_NOT_READY"
  | "POOL_STATUS_READY"
  | "POOL_STATUS_PREPARING"
  | "POOL_STATUS_ACTIVE"
  | "POOL_STATUS_FINISHED";

export type FighterRef = {
  fighterId: string;
  name: string;
  club: string;
};

/**
 * PoolStanding — одна строка итоговой таблицы пула (спека 0016, FR-1..FR-4):
 * статистика бойца по завершённым боям пула + итоговое место. `place`
 * вычислен сервером с учётом дележа (FR-3: 1, 2, 2, 4) — клиент не
 * пересчитывает и не досортировывает (FR-8).
 */
export type PoolStanding = {
  fighter: FighterRef;
  wins: number;
  draws: number;
  losses: number;
  pointsScored: number;
  pointsConceded: number;
  place: number;
};

/**
 * Pool — пул номинации. `arenaId`/`arenaName` пусты, если пул не поставлен
 * на арену (спека 0011). `nominationName` — резолвленное на чтение название
 * номинации пула (denormalized, FR-9: список «готовых пулов» на экране арены
 * собран из разных номинаций — без имени они неразличимы). `standings` —
 * итоговая таблица пула (спека 0016), пуста, если в пуле нет ни одного
 * завершённого боя (FR-7) либо на путях, связанных с ареной/табло, где она
 * осознанно не заполняется.
 */
export type Pool = {
  id: string;
  nominationId: string;
  nominationName: string;
  number: number;
  name: string;
  members: FighterRef[];
  status: PoolStatus;
  arenaId: string;
  arenaName: string;
  standings: PoolStanding[];
};

export type PoolLayout = {
  nominationId: string;
  status: PoolLayoutStatus;
  unassigned: FighterRef[];
  pools: Pool[];
  canUndo: boolean;
};

/** poolLayoutStatusLabel — человекочитаемый статус раскладки (RU). */
export function poolLayoutStatusLabel(status: PoolLayoutStatus): string {
  switch (status) {
    case "POOL_LAYOUT_STATUS_DRAFT":
      return "черновик";
    case "POOL_LAYOUT_STATUS_READY":
      return "готово";
    default:
      return "—";
  }
}

/** poolStatusLabel — человекочитаемый статус пула (RU, спека 0011). */
export function poolStatusLabel(status: PoolStatus): string {
  switch (status) {
    case "POOL_STATUS_NOT_READY":
      return "не готов";
    case "POOL_STATUS_READY":
      return "готов";
    case "POOL_STATUS_PREPARING":
      return "готовится к запуску";
    case "POOL_STATUS_ACTIVE":
      return "идёт";
    case "POOL_STATUS_FINISHED":
      return "завершён";
    default:
      return "—";
  }
}

/**
 * BoutState — состояние отдельного боя (спека 0013, FR-1). Все переходы
 * обратимы: не начат ⇄ идёт ⇄ завершён.
 */
export type BoutState =
  | "BOUT_STATE_UNSPECIFIED"
  | "BOUT_STATE_NOT_STARTED"
  | "BOUT_STATE_IN_PROGRESS"
  | "BOUT_STATE_FINISHED";

/** boutStateLabel — человекочитаемое состояние боя (RU, спека 0013). */
export function boutStateLabel(state: BoutState): string {
  switch (state) {
    case "BOUT_STATE_NOT_STARTED":
      return "не начат";
    case "BOUT_STATE_IN_PROGRESS":
      return "идёт";
    case "BOUT_STATE_FINISHED":
      return "завершён";
    default:
      return "—";
  }
}

/**
 * BoardBout — проекция одного боя пула для доски ведения (спека 0013,
 * FR-14): собственная проекция pool, не переиспользует entities/bout.
 * `scoreA`/`scoreB` — актуальный счёт (0:0 у не начатого); `state` —
 * текущая фаза ЖЦ боя.
 */
export type BoardBout = {
  id: string;
  roundNumber: number;
  sequenceNumber: number;
  fighterA: FighterRef;
  fighterB: FighterRef;
  state: BoutState;
  scoreA: number;
  scoreB: number;
};

/**
 * BoutBoard — доска ведения боёв одной арены (спека 0013, FR-14): стоящий
 * на ней пул (`null`, если арена свободна), его бои по порядку проведения
 * (0010) и текущий бой. `currentBoutId` пуст, если у пула нет боёв.
 */
export type BoutBoard = {
  pool: Pool | null;
  bouts: BoardBout[];
  currentBoutId: string;
};

/**
 * outcomeOf выводит исход боя из счёта (спека 0013, FR-3): больше очков —
 * победа этого бойца, равные — ничья. Отдельного выбора победителя нет.
 */
export function outcomeOf(scoreA: number, scoreB: number): "A" | "B" | "draw" {
  if (scoreA > scoreB) return "A";
  if (scoreB > scoreA) return "B";
  return "draw";
}
