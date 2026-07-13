/**
 * Application — заявка бойца, реконструированная из потока событий на
 * сервере (ADR 0011). Сериализуемая форма (без bigint/Date), безопасна для
 * передачи из server component в client component через props и для рендера.
 *
 * Соответствует proto `hema.v1.Application`, но Timestamp-поля приведены к
 * ISO-строкам, а `state`/`type` — к строковым литералам (как `Role` в
 * entities/user).
 */

export type ApplicationState =
  | "APPLICATION_STATE_UNSPECIFIED"
  | "APPLICATION_STATE_SUBMITTED"
  | "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION"
  | "APPLICATION_STATE_PAID"
  | "APPLICATION_STATE_REGISTERED"
  | "APPLICATION_STATE_WITHDRAWN";

export type ApplicationEventType =
  | "APPLICATION_EVENT_TYPE_UNSPECIFIED"
  | "APPLICATION_EVENT_TYPE_SUBMITTED"
  | "APPLICATION_EVENT_TYPE_PAYMENT_DECLARED"
  | "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED"
  | "APPLICATION_EVENT_TYPE_FIGHTER_REGISTERED"
  | "APPLICATION_EVENT_TYPE_WITHDRAWN"
  | "APPLICATION_EVENT_TYPE_AMENDED";

export type Application = {
  id: string;
  nominationId: string;
  tournamentId: string;
  applicantUserId: string;
  applicantDisplayName: string;
  state: ApplicationState;
  // club — клуб бойца (может быть пустым). needsEquipment — нужна ли
  // экипировка от организатора (спека 0006).
  club: string;
  needsEquipment: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationEvent = {
  type: ApplicationEventType;
  actorId: string;
  occurredAt: string;
  sequence: number;
};

// NominationParticipant — элемент публичного стартового листа номинации.
// Без applicantUserId: публичная выдача не раскрывает идентификаторы. club —
// публичное поле (поправка 0006 в спеке 0007: клуб бойца виден в составе
// номинации).
export type NominationParticipant = {
  displayName: string;
  state: ApplicationState;
  club: string;
};

export type NominationParticipants = {
  participants: NominationParticipant[];
  appliedCount: number;
  confirmedCount: number;
  // fighterCapacity — soft cap номинации. null = не задан.
  fighterCapacity: number | null;
};
