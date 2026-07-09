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
  createdAt: string;
  updatedAt: string;
};
