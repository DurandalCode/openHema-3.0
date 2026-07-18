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
 * Pool — пул номинации. `arenaId`/`arenaName` пусты, если пул не поставлен
 * на арену (спека 0011). `nominationName` — резолвленное на чтение название
 * номинации пула (denormalized, FR-9: список «готовых пулов» на экране арены
 * собран из разных номинаций — без имени они неразличимы).
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
