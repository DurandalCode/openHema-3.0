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
import { ArenaSchema, type Arena } from "@/gen/hema/v1/arena_pb";
import { PoolLayoutSchema, type PoolLayout } from "@/gen/hema/v1/pool_pb";
import { BoutSchema, type Bout } from "@/gen/hema/v1/bout_pb";
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
import type {
  Arena as ArenaDto,
  ArenaStatus as ArenaStatusDto,
} from "@/entities/arena/lib/types";
import type {
  PoolLayout as PoolLayoutDto,
  PoolLayoutStatus as PoolLayoutStatusDto,
  FighterRef as PoolFighterRefDto,
  Pool as PoolDto,
} from "@/entities/pool/lib/types";
import type {
  Bout as BoutDto,
  FighterRef as BoutFighterRefDto,
} from "@/entities/bout/lib/types";

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

/**
 * arenaToJson превращает protobuf-сообщение Arena в обычный JSON-объект.
 * `status` — строковый литерал. Нормализует proto3-дефолты: пустые строки
 * сохраняются (UI ждёт строку, не undefined), position = 0 при отсутствии.
 */
export function arenaToJson(arena: Arena | undefined): ArenaDto | null {
  if (!arena) return null;
  const raw = toJson(ArenaSchema, arena) as Partial<ArenaDto>;
  return {
    id: raw.id ?? "",
    tournamentId: raw.tournamentId ?? "",
    name: raw.name ?? "",
    description: raw.description ?? "",
    position: raw.position ?? 0,
    status: (raw.status as ArenaStatusDto) ?? "ARENA_STATUS_UNSPECIFIED",
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

/** arenasToJson превращает массив protobuf Arena в массив DTO. */
export function arenasToJson(arenas: Arena[] | undefined): ArenaDto[] {
  if (!arenas) return [];
  return arenas.map((a) => arenaToJson(a)).filter((a): a is ArenaDto => a !== null);
}

function poolFighterRefToJson(raw: Partial<PoolFighterRefDto> | undefined): PoolFighterRefDto {
  return { fighterId: raw?.fighterId ?? "", name: raw?.name ?? "", club: raw?.club ?? "" };
}

/**
 * poolLayoutToJson превращает protobuf-сообщение PoolLayout в обычный
 * JSON-объект (спека 0009). `status` — строковый литерал; `pools`/
 * `unassigned` — нормализованные массивы (без undefined-полей).
 */
export function poolLayoutToJson(layout: PoolLayout | undefined): PoolLayoutDto | null {
  if (!layout) return null;
  const raw = toJson(PoolLayoutSchema, layout) as Partial<PoolLayoutDto>;
  return {
    nominationId: raw.nominationId ?? "",
    status: (raw.status as PoolLayoutStatusDto) ?? "POOL_LAYOUT_STATUS_UNSPECIFIED",
    unassigned: Array.isArray(raw.unassigned) ? raw.unassigned.map(poolFighterRefToJson) : [],
    pools: Array.isArray(raw.pools)
      ? raw.pools.map(
          (p): PoolDto => ({
            id: p.id ?? "",
            nominationId: p.nominationId ?? "",
            number: p.number ?? 0,
            name: p.name ?? "",
            members: Array.isArray(p.members) ? p.members.map(poolFighterRefToJson) : [],
          }),
        )
      : [],
    canUndo: raw.canUndo ?? false,
  };
}

function boutFighterRefToJson(raw: Partial<BoutFighterRefDto> | undefined): BoutFighterRefDto {
  return { fighterId: raw?.fighterId ?? "", name: raw?.name ?? "", club: raw?.club ?? "" };
}

/**
 * boutToJson превращает protobuf-сообщение Bout в обычный JSON-объект
 * (спека 0010). `fighterA`/`fighterB` — снапшот бойца на момент формирования,
 * нормализуются как pool.FighterRef (пустая строка вместо undefined).
 */
export function boutToJson(bout: Bout | undefined): BoutDto | null {
  if (!bout) return null;
  const raw = toJson(BoutSchema, bout) as Partial<BoutDto>;
  return {
    id: raw.id ?? "",
    poolId: raw.poolId ?? "",
    nominationId: raw.nominationId ?? "",
    roundNumber: raw.roundNumber ?? 0,
    sequenceNumber: raw.sequenceNumber ?? 0,
    fighterA: boutFighterRefToJson(raw.fighterA),
    fighterB: boutFighterRefToJson(raw.fighterB),
  };
}

/** boutsToJson превращает массив protobuf Bout в массив DTO. */
export function boutsToJson(bouts: Bout[] | undefined): BoutDto[] {
  if (!bouts) return [];
  return bouts.map((b) => boutToJson(b)).filter((b): b is BoutDto => b !== null);
}
