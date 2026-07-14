/**
 * Пулы номинации — раскладка бойцов по группам (спека 0009).
 *
 * Сериализуемая форма (без bigint/Date), status — строковый литерал. Имя
 * пула («Пул N») генерируется сервером из number, не хранится отдельно и не
 * редактируется.
 */

export type PoolLayoutStatus =
  | "POOL_LAYOUT_STATUS_UNSPECIFIED"
  | "POOL_LAYOUT_STATUS_DRAFT"
  | "POOL_LAYOUT_STATUS_READY"
  | "POOL_LAYOUT_STATUS_ACTIVE"
  | "POOL_LAYOUT_STATUS_FINISHED";

export type FighterRef = {
  fighterId: string;
  name: string;
  club: string;
};

export type Pool = {
  id: string;
  nominationId: string;
  number: number;
  name: string;
  members: FighterRef[];
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
    case "POOL_LAYOUT_STATUS_ACTIVE":
      return "идут бои";
    case "POOL_LAYOUT_STATUS_FINISHED":
      return "завершено";
    default:
      return "—";
  }
}
