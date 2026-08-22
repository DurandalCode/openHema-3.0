/**
 * Tournament — публичное представление турнира для UI.
 * Сериализуемая форма (без bigint/Date), безопасна для передачи из server
 * component в client component через props и для рендера.
 *
 * Соответствует proto `hema.v1.Tournament`, но Timestamp-поля приведены к
 * ISO-строкам (или пустой строке, если значение не задано), а enum ContactType —
 * к строковому литералу.
 */

export type ContactType =
  | "CONTACT_TYPE_UNSPECIFIED"
  | "CONTACT_TYPE_TELEGRAM"
  | "CONTACT_TYPE_VK"
  | "CONTACT_TYPE_FACEBOOK"
  | "CONTACT_TYPE_WEBSITE"
  | "CONTACT_TYPE_EMAIL"
  | "CONTACT_TYPE_OTHER";

export type ContactJson = {
  id?: string;
  type: ContactType;
  value: string;
  position?: number;
};

export type Tournament = {
  id: string;
  title: string;
  description: string;
  // ISO-строка ("" если не задано). Однодневный турнир: только eventStartAt.
  // Многодневный: eventStartAt + eventEndAt.
  eventStartAt: string;
  eventEndAt: string;
  emblemUrl: string;
  isActive: boolean;
  contacts: ContactJson[];
  createdAt: string;
  updatedAt: string;
  // chiefJudge — главный судья турнира (ФИО свободной строкой). "" — не указан.
  chiefJudge: string;
  // regulationsUrl — веб-адрес регламента (http/https). "" — не задан.
  regulationsUrl: string;
  // venueName / venueAddress — место проведения: название площадки и адрес.
  // Опциональны независимо друг от друга, "" — не заполнено.
  venueName: string;
  venueAddress: string;
  // entryFeeMinor — взнос за участие в одной номинации, в минорных единицах
  // валюты (копейки). `null` — «не задан», отличимо от явного 0 (spec 0037,
  // FR-21). Приходит из JSON int64 строкой — normalizeToJson приводит к
  // числу (см. tournamentToJson).
  entryFeeMinor: number | null;
  // entryFeeCurrency — код валюты ISO-4217 ("RUB"). "" при entryFeeMinor === null.
  entryFeeCurrency: string;
};