/**
 * Nomination — публичное представление номинации турнира для UI.
 * Сериализуемая форма (без bigint/Date), безопасна для передачи из server
 * component в client component через props и для рендера.
 *
 * Соответствует proto `hema.v1.Nomination`, но Timestamp-поля приведены к
 * ISO-строкам.
 */

export type NominationMetadata = {
  // rulesUrl — ссылка на правила/регламент. "" = не задано.
  rulesUrl: string;
};

/**
 * NominationStatus — статус жизненного цикла номинации (спека 0012, FR-1).
 * `OPEN`/`CLOSED` — приём заявок открыт/закрыт (причина закрытия — ручная
 * или от раскладки — не публична, см. plan.md). `ACTIVE`/`FINISHED` —
 * enum-закладки под будущую фазу боёв, в этом инкременте не достигаются.
 */
export type NominationStatus =
  | "NOMINATION_STATUS_UNSPECIFIED"
  | "NOMINATION_STATUS_OPEN"
  | "NOMINATION_STATUS_CLOSED"
  | "NOMINATION_STATUS_ACTIVE"
  | "NOMINATION_STATUS_FINISHED";

export type Nomination = {
  id: string;
  tournamentId: string;
  title: string;
  description: string;
  // fighterCapacity — плановая вместимость. null = не задано (отличается от 0).
  fighterCapacity: number | null;
  metadata: NominationMetadata;
  // position — порядок в списке номинаций турнира (0-индекс).
  position: number;
  status: NominationStatus;
  createdAt: string;
  updatedAt: string;
};

/** nominationStatusLabel — человекочитаемый статус номинации (RU, спека 0012). */
export function nominationStatusLabel(status: NominationStatus): string {
  switch (status) {
    case "NOMINATION_STATUS_OPEN":
      return "приём заявок открыт";
    case "NOMINATION_STATUS_CLOSED":
      return "приём заявок завершён";
    case "NOMINATION_STATUS_ACTIVE":
      return "идёт";
    case "NOMINATION_STATUS_FINISHED":
      return "завершена";
    default:
      return "—";
  }
}
