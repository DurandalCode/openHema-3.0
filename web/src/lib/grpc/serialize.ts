import { toJson } from "@bufbuild/protobuf";
import { UserSchema, type User } from "@/gen/hema/v1/common_pb";
import { TournamentSchema, type Tournament } from "@/gen/hema/v1/tournament_pb";
import { NominationSchema, type Nomination } from "@/gen/hema/v1/nomination_pb";
import {
  ApplicationSchema,
  ApplicationEventSchema,
  NominationParticipantSchema,
  type Application,
  type ApplicationEvent,
  type NominationParticipant,
} from "@/gen/hema/v1/application_pb";
import {
  FighterSchema,
  RosterEntrySchema,
  type Fighter,
  type RosterEntry,
} from "@/gen/hema/v1/fighter_pb";
import type { Tournament as TournamentDto } from "@/entities/tournament/lib/types";
import type { Nomination as NominationDto } from "@/entities/nomination/lib/types";
import type {
  Application as ApplicationDto,
  ApplicationEvent as ApplicationEventDto,
  ApplicationState as ApplicationStateDto,
  ApplicationEventType as ApplicationEventTypeDto,
  NominationParticipant as NominationParticipantDto,
} from "@/entities/application/lib/types";
import type {
  Fighter as FighterDto,
  FighterStatus as FighterStatusDto,
  WithdrawalReason as WithdrawalReasonDto,
  Participation as ParticipationDto,
  ParticipationStatus as ParticipationStatusDto,
  RosterEntry as RosterEntryDto,
} from "@/entities/fighter/lib/types";

/**
 * userToJson превращает protobuf-сообщение User в обычный JSON-объект,
 * пригодный для NextResponse.json (Timestamp → ISO-строка, без BigInt).
 */
export function userToJson(user: User | undefined) {
  if (!user) return null;
  return toJson(UserSchema, user);
}

/**
 * tournamentToJson превращает protobuf-сообщение Tournament в обычный
 * JSON-объект, пригодный для NextResponse.json.
 *
 * Нормализует proto3-дефолты: `toJson` опускает пустые строки и пустой
 * `repeated`, но consumer (TournamentHero, форма) ждёт поля по контракту
 * `Tournament` (title/description/emblemUrl — строки, contacts — массив).
 * Без нормализации пустой seed-турнир отдаёт JSON без `contacts`, и
 * `TournamentHero` падает на `undefined.filter(...)`.
 */
export function tournamentToJson(tournament: Tournament | undefined): TournamentDto | null {
  if (!tournament) return null;
  const raw = toJson(TournamentSchema, tournament) as Partial<TournamentDto>;
  return {
    id: raw.id ?? "",
    title: raw.title ?? "",
    description: raw.description ?? "",
    eventStartAt: raw.eventStartAt ?? "",
    eventEndAt: raw.eventEndAt ?? "",
    emblemUrl: raw.emblemUrl ?? "",
    isActive: raw.isActive ?? false,
    contacts: Array.isArray(raw.contacts)
      ? raw.contacts.map((c) => ({ ...c, value: c.value ?? "", position: c.position ?? 0 }))
      : [],
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

/**
 * nominationToJson превращает protobuf-сообщение Nomination в обычный
 * JSON-объект, пригодный для NextResponse.json.
 *
 * Нормализует proto3-дефолты аналогично tournamentToJson. `fighterCapacity`
 * (proto3 `optional int32`) сохраняет presence: `null` = не задано, отличимо
 * от явного 0 (FR-10 в спеке номинаций).
 */
export function nominationToJson(nomination: Nomination | undefined): NominationDto | null {
  if (!nomination) return null;
  const raw = toJson(NominationSchema, nomination) as Partial<NominationDto> & {
    fighterCapacity?: number;
  };
  return {
    id: raw.id ?? "",
    tournamentId: raw.tournamentId ?? "",
    title: raw.title ?? "",
    description: raw.description ?? "",
    fighterCapacity: typeof raw.fighterCapacity === "number" ? raw.fighterCapacity : null,
    metadata: { rulesUrl: raw.metadata?.rulesUrl ?? "" },
    position: raw.position ?? 0,
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

/** nominationsToJson превращает массив protobuf Nomination в массив DTO. */
export function nominationsToJson(nominations: Nomination[] | undefined): NominationDto[] {
  if (!nominations) return [];
  return nominations
    .map((n) => nominationToJson(n))
    .filter((n): n is NominationDto => n !== null);
}

/**
 * applicationToJson превращает protobuf-сообщение Application в обычный
 * JSON-объект. `state` — строковый литерал (как `role` у User), не число.
 */
export function applicationToJson(app: Application | undefined): ApplicationDto | null {
  if (!app) return null;
  const raw = toJson(ApplicationSchema, app) as Partial<ApplicationDto>;
  return {
    id: raw.id ?? "",
    nominationId: raw.nominationId ?? "",
    tournamentId: raw.tournamentId ?? "",
    applicantUserId: raw.applicantUserId ?? "",
    applicantDisplayName: raw.applicantDisplayName ?? "",
    state: (raw.state as ApplicationStateDto) ?? "APPLICATION_STATE_UNSPECIFIED",
    club: raw.club ?? "",
    needsEquipment: raw.needsEquipment ?? false,
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

/** applicationsToJson превращает массив protobuf Application в массив DTO. */
export function applicationsToJson(apps: Application[] | undefined): ApplicationDto[] {
  if (!apps) return [];
  return apps
    .map((a) => applicationToJson(a))
    .filter((a): a is ApplicationDto => a !== null);
}

/** applicationHistoryToJson превращает историю заявки (ApplicationEvent[]) в DTO. */
export function applicationHistoryToJson(
  history: ApplicationEvent[] | undefined,
): ApplicationEventDto[] {
  if (!history) return [];
  return history.map((ev) => {
    const raw = toJson(ApplicationEventSchema, ev) as Partial<ApplicationEventDto>;
    return {
      type: (raw.type as ApplicationEventTypeDto) ?? "APPLICATION_EVENT_TYPE_UNSPECIFIED",
      actorId: raw.actorId ?? "",
      occurredAt: raw.occurredAt ?? "",
      sequence: raw.sequence ?? 0,
    };
  });
}

/**
 * nominationParticipantsToJson превращает публичный стартовый лист номинации
 * (NominationParticipant[]) в массив DTO.
 */
export function nominationParticipantsToJson(
  participants: NominationParticipant[] | undefined,
): NominationParticipantDto[] {
  if (!participants) return [];
  return participants.map((p) => {
    const raw = toJson(NominationParticipantSchema, p) as Partial<NominationParticipantDto>;
    return {
      displayName: raw.displayName ?? "",
      state: (raw.state as ApplicationStateDto) ?? "APPLICATION_STATE_UNSPECIFIED",
      club: raw.club ?? "",
    };
  });
}

/**
 * fighterToJson превращает protobuf-сообщение Fighter в обычный JSON-объект.
 * `status`/`withdrawalReason`/`participations[].status` — строковые литералы.
 */
export function fighterToJson(fighter: Fighter | undefined): FighterDto | null {
  if (!fighter) return null;
  const raw = toJson(FighterSchema, fighter) as Partial<FighterDto>;
  return {
    id: raw.id ?? "",
    tournamentId: raw.tournamentId ?? "",
    name: raw.name ?? "",
    club: raw.club ?? "",
    status: (raw.status as FighterStatusDto) ?? "FIGHTER_STATUS_UNSPECIFIED",
    withdrawalReason: (raw.withdrawalReason as WithdrawalReasonDto) ?? "WITHDRAWAL_REASON_UNSPECIFIED",
    participations: Array.isArray(raw.participations)
      ? raw.participations.map(
          (p): ParticipationDto => ({
            nominationId: p.nominationId ?? "",
            status: (p.status as ParticipationStatusDto) ?? "PARTICIPATION_STATUS_UNSPECIFIED",
          }),
        )
      : [],
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

/** fightersToJson превращает массив protobuf Fighter в массив DTO. */
export function fightersToJson(fighters: Fighter[] | undefined): FighterDto[] {
  if (!fighters) return [];
  return fighters.map((f) => fighterToJson(f)).filter((f): f is FighterDto => f !== null);
}

/**
 * rosterEntriesToJson превращает публичный состав номинации (RosterEntry[])
 * в массив DTO.
 */
export function rosterEntriesToJson(entries: RosterEntry[] | undefined): RosterEntryDto[] {
  if (!entries) return [];
  return entries.map((e) => {
    const raw = toJson(RosterEntrySchema, e) as Partial<RosterEntryDto>;
    return {
      name: raw.name ?? "",
      club: raw.club ?? "",
      inRoster: raw.inRoster ?? false,
    };
  });
}
