/**
 * Arena — площадка/ристалище турнира (спека 0008). Независимая сущность: не
 * ссылается на бойцов/номинации/заявки. Будущие бои будут ссылаться на
 * arena_id.
 *
 * Сериализуемая форма (без bigint/Date), Timestamp-поля приведены к ISO-строкам,
 * status — к строковому литералу.
 */

export type ArenaStatus =
  | "ARENA_STATUS_UNSPECIFIED"
  | "ARENA_STATUS_ACTIVE"
  | "ARENA_STATUS_ARCHIVED";

export type Arena = {
  id: string;
  tournamentId: string;
  name: string;
  description: string;
  // position — порядок в списке площадок турнира (0-индекс).
  position: number;
  status: ArenaStatus;
  createdAt: string;
  updatedAt: string;
};

/** arenaStatusLabel — человекочитаемый статус площадки (RU). */
export function arenaStatusLabel(status: ArenaStatus): string {
  switch (status) {
    case "ARENA_STATUS_ACTIVE":
      return "активна";
    case "ARENA_STATUS_ARCHIVED":
      return "в архиве";
    default:
      return "—";
  }
}