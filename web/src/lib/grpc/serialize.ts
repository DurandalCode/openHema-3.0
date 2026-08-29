import { toJson } from "@bufbuild/protobuf";
import { UserSchema, type User } from "@/gen/hema/v1/common_pb";
import { TournamentSchema, type Tournament } from "@/gen/hema/v1/tournament_pb";
import { SessionSchema, type Session as SessionProto } from "@/gen/hema/v1/auth_pb";
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
import {
  PoolLayoutSchema,
  PoolSchema,
  BoutBoardSchema,
  NominationLiveSnapshotSchema,
  ArenaLiveSnapshotSchema,
  TimerCommandSchema,
  StageSchema,
  BracketSchema,
  SeedingRuleSchema,
  StageBuildPreviewSchema,
  SchemaIssueSchema,
  FormatStageSpecSchema,
  FormatPresetSchema,
  StageSourceKind,
  StageSelectorKind,
  StageLayoutMethod,
  NominationResultsSchema,
  BoutJournalEntrySchema,
  TournamentLiveSnapshotSchema,
  TournamentConsoleSnapshotSchema,
  type PoolLayout,
  type Pool,
  type BoutBoard,
  type BoutJournalEntry,
  type NominationLiveSnapshot,
  type ArenaLiveSnapshot,
  type TimerCommand,
  type Stage,
  type Bracket,
  type SeedingRule,
  type StageBuildPreview,
  type SchemaIssue,
  type FormatStageSpec,
  type FormatPreset,
  type NominationResults,
  type TournamentLiveSnapshot,
  type TournamentConsoleSnapshot,
} from "@/gen/hema/v1/stage_pb";
import { BoutSchema, type Bout } from "@/gen/hema/v1/bout_pb";
import type { Tournament as TournamentDto } from "@/entities/tournament/lib/types";
import type { CurrentUser, Session } from "@/entities/user/lib/types";
import type {
  Nomination as NominationDto,
  NominationStatus as NominationStatusDto,
} from "@/entities/nomination/lib/types";
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
  PoolStatus as PoolStatusDto,
  FighterRef as PoolFighterRefDto,
  Pool as PoolDto,
  PoolStanding as PoolStandingDto,
  BoutBoard as BoutBoardDto,
  BoardBout as BoardBoutDto,
  BoutState as BoutStateDto,
} from "@/entities/pool/lib/types";
import type {
  Bout as BoutDto,
  FighterRef as BoutFighterRefDto,
} from "@/entities/bout/lib/types";
import type {
  NominationLiveSnapshotDto,
  LivePoolDto,
} from "@/entities/nomination-live/lib/types";
import type {
  TournamentConsoleSnapshotDto,
  ConsoleArena as ConsoleArenaDto,
  ConsoleNomination as ConsoleNominationDto,
  ConsoleQueueItem as ConsoleQueueItemDto,
  ConsoleAlert as ConsoleAlertDto,
  ConsoleAlertKind as ConsoleAlertKindDto,
  ArenaIdleState as ArenaIdleStateDto,
} from "@/entities/tournament-console/lib/types";
import type { ForecastDto, PaceEstimateDto } from "@/shared/lib/forecast-time";
import type {
  TournamentLiveSnapshotDto,
  LiveArenaDto,
  LiveArenaState as LiveArenaStateDto,
  LiveFeedBoutDto,
  LiveNominationDto,
  LiveNominationPhase as LiveNominationPhaseDto,
} from "@/entities/tournament-live/lib/types";
import type {
  Stage as StageDto,
  StageType as StageTypeDto,
  StageStatus as StageStatusDto,
  StageSourceKind as StageSourceKindDto,
  StageSelectorKind as StageSelectorKindDto,
  StageLayoutMethod as StageLayoutMethodDto,
  BracketConfig as BracketConfigDto,
  GroupsConfig as GroupsConfigDto,
  SeedingRule as SeedingRuleDto,
  StageBuildEntry as StageBuildEntryDto,
  StageBuildTie as StageBuildTieDto,
  TieResolution as TieResolutionDto,
  StageBuildPreview as StageBuildPreviewDto,
  SchemaIssue as SchemaIssueDto,
  SchemaIssueSeverity as SchemaIssueSeverityDto,
  SchemaIssueCode as SchemaIssueCodeDto,
  FormatStageSpec as FormatStageSpecDto,
  FormatPreset as FormatPresetDto,
} from "@/entities/stage/lib/types";
import type {
  Bracket as BracketDto,
  BracketRound as BracketRoundDto,
  BracketHalf as BracketHalfDto,
  BracketPair as BracketPairDto,
  BracketSlot as BracketSlotDto,
  BracketSlotState as BracketSlotStateDto,
} from "@/entities/bracket/lib/types";
import type {
  ArenaLiveSnapshotDto,
  TimerFrameDto,
  ScoreboardRoomDto,
  TimerStatusDto,
  TimerCommandDto,
  TimerCommandKindDto,
} from "@/entities/arena-live/lib/types";
import type {
  JournalEntryDto,
  JournalEntryKindDto,
} from "@/entities/arena-live/lib/journal";
import type {
  NominationResultEntry as NominationResultEntryDto,
  NominationResultsSection as NominationResultsSectionDto,
  NominationResults as NominationResultsDto,
} from "@/entities/nomination-results/lib/types";
import { emptyNominationResults } from "@/entities/nomination-results/lib/types";

/**
 * userToJson превращает protobuf-сообщение User в обычный JSON-объект,
 * пригодный для NextResponse.json (Timestamp → ISO-строка, без BigInt).
 *
 * Нормализует proto3-дефолт `club` (spec 0037, FR-13/FR-15): `toJson`
 * опускает пустую строку, но `club` в UI/CurrentUser — обязательное поле
 * контракта (пустая строка == «клуб не указан», не «поле отсутствует»),
 * тот же приём, что уже применён к `tournamentToJson`.
 */
export function userToJson(user: User | undefined): CurrentUser | null {
  if (!user) return null;
  const raw = toJson(UserSchema, user) as Partial<CurrentUser> & {
    emailVerified?: boolean;
    pendingEmail?: string;
    notifications?: { applicationState?: boolean; poolSeated?: boolean };
  };
  return {
    id: raw.id ?? "",
    email: raw.email ?? "",
    displayName: raw.displayName ?? "",
    role: raw.role ?? "ROLE_UNSPECIFIED",
    createdAt: raw.createdAt ?? "",
    club: raw.club ?? "",
    emailVerified: raw.emailVerified ?? false,
    pendingEmail: raw.pendingEmail ?? "",
    notifications: {
      applicationState: raw.notifications?.applicationState ?? false,
      poolSeated: raw.notifications?.poolSeated ?? false,
    },
  };
}

/**
 * sessionToJson превращает protobuf-сообщение Session (спека 0042, FR-11)
 * в обычный JSON-объект. Без устройства/браузера/IP (решение 2 спеки) —
 * только id, времена и признак «текущая».
 */
export function sessionToJson(session: SessionProto): Session {
  const raw = toJson(SessionSchema, session) as Partial<Session>;
  return {
    id: raw.id ?? "",
    createdAt: raw.createdAt ?? "",
    lastSeenAt: raw.lastSeenAt ?? "",
    current: raw.current ?? false,
  };
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
 *
 * `entryFeeMinor` (proto3 `optional int64`, spec 0037/FR-21) — отдельный
 * случай: connect-es сериализует 64-битные числа в JSON СТРОКОЙ ("150000"),
 * не числом, и это единственное поле, где presence различает «не задан»
 * (`undefined` в toJson → `null` в DTO) от заданного нуля ("0" → 0).
 */
export function tournamentToJson(tournament: Tournament | undefined): TournamentDto | null {
  if (!tournament) return null;
  const raw = toJson(TournamentSchema, tournament) as Partial<TournamentDto> & {
    entryFeeMinor?: string;
    regulationsFile?: { url?: string; name?: string; size?: string };
    emblemFile?: { url?: string; name?: string; size?: string };
    notifications?: { applicationState?: boolean; poolSeated?: boolean };
  };
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
    chiefJudge: raw.chiefJudge ?? "",
    regulationsUrl: raw.regulationsUrl ?? "",
    venueName: raw.venueName ?? "",
    venueAddress: raw.venueAddress ?? "",
    entryFeeMinor: typeof raw.entryFeeMinor === "string" ? Number(raw.entryFeeMinor) : null,
    entryFeeCurrency: raw.entryFeeCurrency ?? "",
    // program (спека 0040, FR-14/FR-15): та же нормализация proto3-дефолтов,
    // что contacts — пустой repeated опускается toJson целиком, а вложенные
    // поля дня/пункта (date/items/timeLabel/text) опускаются по отдельности
    // на своём зероvalue.
    program: Array.isArray(raw.program)
      ? raw.program.map((d) => ({
          date: d.date ?? "",
          items: Array.isArray(d.items)
            ? d.items.map((it) => ({ timeLabel: it.timeLabel ?? "", text: it.text ?? "" }))
            : [],
        }))
      : [],
    // regulationsFile / emblemFile (спека 0042, FR-30/FR-31): size — int64,
    // connect-es сериализует в JSON строкой (тот же приём, что entryFeeMinor).
    regulationsFile: {
      url: raw.regulationsFile?.url ?? "",
      name: raw.regulationsFile?.name ?? "",
      size: Number(raw.regulationsFile?.size ?? "0"),
    },
    emblemFile: {
      url: raw.emblemFile?.url ?? "",
      name: raw.emblemFile?.name ?? "",
      size: Number(raw.emblemFile?.size ?? "0"),
    },
    notifications: {
      applicationState: raw.notifications?.applicationState ?? false,
      poolSeated: raw.notifications?.poolSeated ?? false,
    },
  };
}

/**
 * nominationToJson превращает protobuf-сообщение Nomination в обычный
 * JSON-объект, пригодный для NextResponse.json.
 *
 * Нормализует proto3-дефолты аналогично tournamentToJson. `fighterCapacity`
 * (proto3 `optional int32`) сохраняет presence: `null` = не задано, отличимо
 * от явного 0 (FR-10 в спеке номинаций). `status` — статус жизненного цикла
 * номинации (спека 0012, FR-8); proto3-дефолт (enum 0) нормализуется в
 * `NOMINATION_STATUS_UNSPECIFIED`.
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
    status: (raw.status as NominationStatusDto) ?? "NOMINATION_STATUS_UNSPECIFIED",
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
      actorDisplayName: raw.actorDisplayName ?? "",
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
    fromApplication: raw.fromApplication ?? false,
    // linkedAccountId/linkedAccountDisplayName/mergedIntoId (спека 0040,
    // FR-8/FR-10): сервер заполняет их ТОЛЬКО в ответах FighterAdminService
    // (ADR 0016 не расширяется) — в ответах FighterPublicService/
    // FighterService этих полей нет вовсе, `raw.*` для них `undefined`, и
    // здесь они естественно схлопываются в "".
    linkedAccountId: raw.linkedAccountId ?? "",
    linkedAccountDisplayName: raw.linkedAccountDisplayName ?? "",
    mergedIntoId: raw.mergedIntoId ?? "",
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
 * `defaultDurationSeconds` (спека 0015, FR-8) — недоменная дефолтная
 * длительность боя; proto3-omitted (0, до миграции/сидирования) заменяется
 * на дефолт схемы 90с, а не 0 (0с — не валидная длительность боя).
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
    defaultDurationSeconds: raw.defaultDurationSeconds || 90,
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
 * poolStandingToJson нормализует одну строку итоговой таблицы пула (спека
 * 0016) — числовые поля клэмпятся к 0, `fighter` — как остальные снапшоты
 * бойца.
 */
function poolStandingToJson(raw: Partial<PoolStandingDto> | undefined): PoolStandingDto {
  return {
    fighter: poolFighterRefToJson(raw?.fighter),
    wins: raw?.wins ?? 0,
    draws: raw?.draws ?? 0,
    losses: raw?.losses ?? 0,
    pointsScored: raw?.pointsScored ?? 0,
    pointsConceded: raw?.pointsConceded ?? 0,
    place: raw?.place ?? 0,
  };
}

/**
 * poolRawToDto нормализует уже toJson-сериализованный (plain JSON, не proto
 * Message) объект пула — общая часть между `poolLayoutToJson` (пулы вложены
 * в `PoolLayout`) и `poolToJson` (пул как отдельное proto-сообщение).
 * `status`/`arenaId`/`arenaName` — спека 0011; `nominationName` — резолв
 * имени номинации пула (FR-9: «готовые пулы» на экране арены собраны из
 * разных номинаций); `standings` — итоговая таблица пула (спека 0016),
 * пустой массив, если сервер её не заполнил (FR-7 либо путь арены/табло).
 */
function poolRawToDto(raw: Partial<PoolDto> | undefined): PoolDto {
  return {
    id: raw?.id ?? "",
    nominationId: raw?.nominationId ?? "",
    nominationName: raw?.nominationName ?? "",
    number: raw?.number ?? 0,
    name: raw?.name ?? "",
    members: Array.isArray(raw?.members) ? raw.members.map(poolFighterRefToJson) : [],
    status: (raw?.status as PoolStatusDto) ?? "POOL_STATUS_UNSPECIFIED",
    arenaId: raw?.arenaId ?? "",
    arenaName: raw?.arenaName ?? "",
    standings: Array.isArray(raw?.standings) ? raw.standings.map(poolStandingToJson) : [],
    stageId: raw?.stageId ?? "",
  };
}

/** emptyStageDto — безопасный фолбэк для `stage`, когда proto-поле не заполнено. */
function emptyStageDto(): StageDto {
  return {
    id: "",
    nominationId: "",
    position: 0,
    title: "",
    type: "STAGE_TYPE_UNSPECIFIED",
    status: "POOL_LAYOUT_STATUS_UNSPECIFIED",
    bracket: null,
    groups: null,
    rule: null,
    executionStatus: "STAGE_STATUS_UNSPECIFIED",
  };
}

/**
 * groupsConfigRawToDto нормализует уже toJson-сериализованный `GroupsConfig`
 * (спека 0019, FR-8) — общая часть между `stageToJson` (вложен в `Stage`).
 */
function groupsConfigRawToDto(raw: Partial<GroupsConfigDto> | undefined): GroupsConfigDto {
  return { groupCount: raw?.groupCount ?? 0 };
}

/**
 * seedingRuleRawToDto нормализует уже toJson-сериализованное `SeedingRule`
 * (спека 0019, FR-1..FR-4) — общая часть между `stageToJson` (вложен в
 * `Stage`) и `seedingRuleToJson` (правило отдельным сообщением, ответ
 * `SetStageRule`). Enum-поля `toJson` отдаёт полным именем
 * (`STAGE_SOURCE_KIND_ROSTER`) — тот же литерал, что в DTO, доп. маппинг не
 * нужен.
 */
function seedingRuleRawToDto(raw: Partial<SeedingRuleDto> | undefined): SeedingRuleDto {
  return {
    sourceKind: (raw?.sourceKind as StageSourceKindDto) ?? "STAGE_SOURCE_KIND_UNSPECIFIED",
    sourceStageId: raw?.sourceStageId ?? "",
    selector: (raw?.selector as StageSelectorKindDto) ?? "STAGE_SELECTOR_KIND_UNSPECIFIED",
    placeFrom: raw?.placeFrom ?? 0,
    placeTo: raw?.placeTo ?? 0,
    method: (raw?.method as StageLayoutMethodDto) ?? "STAGE_LAYOUT_METHOD_UNSPECIFIED",
  };
}

/**
 * stageToJson превращает protobuf-сообщение Stage в обычный JSON-объект
 * (спека 0017, расширено спеками 0018/0019): копия полей 1:1
 * (id/nominationId/position/title/type/status), `type`/`status` — строки, в
 * которые сериализуют generated-enum'ы (`STAGE_TYPE_GROUPS`,
 * `POOL_LAYOUT_STATUS_DRAFT`), без доменного маппинга. `bracket` заполнен
 * только у `type = STAGE_TYPE_BRACKET` (FR-1), иначе `null`. `groups`/`rule`
 * (0019) — `null`, если proto-поле не заполнено (presence решает «правила/
 * конфига групп нет», не значения полей), иначе нормализованный объект.
 * `executionStatus` (0021, спека 0032) — вычисляемый статус этапа целиком;
 * до 0032 приходил с сервера, но терялся здесь.
 */
export function stageToJson(stage: Stage | undefined): StageDto | null {
  if (!stage) return null;
  const raw = toJson(StageSchema, stage) as Partial<StageDto> & {
    bracket?: { size?: number; thirdPlace?: boolean };
    groups?: Partial<GroupsConfigDto>;
    rule?: Partial<SeedingRuleDto>;
  };
  return {
    id: raw.id ?? "",
    nominationId: raw.nominationId ?? "",
    position: raw.position ?? 0,
    title: raw.title ?? "",
    type: (raw.type as StageTypeDto) ?? "STAGE_TYPE_UNSPECIFIED",
    status: (raw.status as PoolLayoutStatusDto) ?? "POOL_LAYOUT_STATUS_UNSPECIFIED",
    bracket: raw.bracket
      ? { size: raw.bracket.size ?? 0, thirdPlace: raw.bracket.thirdPlace ?? false }
      : null,
    groups: raw.groups ? groupsConfigRawToDto(raw.groups) : null,
    rule: raw.rule ? seedingRuleRawToDto(raw.rule) : null,
    executionStatus: (raw.executionStatus as StageStatusDto) ?? "STAGE_STATUS_UNSPECIFIED",
  };
}

/**
 * seedingRuleToJson превращает protobuf-сообщение SeedingRule в обычный
 * JSON-объект (спека 0019) — используется для ответа `SetStageRule` (через
 * `stage.rule`, уже покрыто `stageToJson`) и там, где правило приходит вне
 * `Stage`. `null`, если сообщение не заполнено.
 */
export function seedingRuleToJson(rule: SeedingRule | undefined): SeedingRuleDto | null {
  if (!rule) return null;
  const raw = toJson(SeedingRuleSchema, rule) as Partial<SeedingRuleDto>;
  return seedingRuleRawToDto(raw);
}

function stageBuildEntryRawToDto(raw: Partial<StageBuildEntryDto> | undefined): StageBuildEntryDto {
  return {
    fighter: poolFighterRefToJson(raw?.fighter),
    originLabel: raw?.originLabel ?? "",
    sourcePlace: raw?.sourcePlace ?? 0,
    overallPlace: raw?.overallPlace ?? 0,
    targetPoolNumber: raw?.targetPoolNumber ?? 0,
    targetSlot: raw?.targetSlot ?? 0,
  };
}

function stageBuildTieRawToDto(raw: Partial<StageBuildTieDto> | undefined): StageBuildTieDto {
  return {
    sourcePoolId: raw?.sourcePoolId ?? "",
    groupLabel: raw?.groupLabel ?? "",
    place: raw?.place ?? 0,
    contenders: Array.isArray(raw?.contenders) ? raw.contenders.map(poolFighterRefToJson) : [],
    slotsLeft: raw?.slotsLeft ?? 0,
  };
}

/**
 * stageBuildPreviewToJson превращает protobuf-сообщение StageBuildPreview в
 * обычный JSON-объект (спека 0019, FR-15) — ответ `PreviewStageBuild`.
 * Вложенные `StageBuildEntry`/`StageBuildTie`/`FighterRef`-массивы
 * нормализуются по тому же паттерну, что `bracketToJson`/`boutBoardToJson`.
 */
export function stageBuildPreviewToJson(
  preview: StageBuildPreview | undefined,
): StageBuildPreviewDto | null {
  if (!preview) return null;
  const raw = toJson(StageBuildPreviewSchema, preview) as Partial<StageBuildPreviewDto>;
  return {
    entries: Array.isArray(raw.entries) ? raw.entries.map(stageBuildEntryRawToDto) : [],
    unselected: Array.isArray(raw.unselected) ? raw.unselected.map(poolFighterRefToJson) : [],
    capacity: raw.capacity ?? 0,
    ties: Array.isArray(raw.ties) ? raw.ties.map(stageBuildTieRawToDto) : [],
    overlaps: Array.isArray(raw.overlaps) ? raw.overlaps.map(poolFighterRefToJson) : [],
    sourceUnfinishedBouts: raw.sourceUnfinishedBouts ?? 0,
  };
}

const sourceKindDtoToProto: Record<StageSourceKindDto, StageSourceKind> = {
  STAGE_SOURCE_KIND_UNSPECIFIED: StageSourceKind.UNSPECIFIED,
  STAGE_SOURCE_KIND_ROSTER: StageSourceKind.ROSTER,
  STAGE_SOURCE_KIND_STAGE: StageSourceKind.STAGE,
};

const selectorKindDtoToProto: Record<StageSelectorKindDto, StageSelectorKind> = {
  STAGE_SELECTOR_KIND_UNSPECIFIED: StageSelectorKind.UNSPECIFIED,
  STAGE_SELECTOR_KIND_ALL: StageSelectorKind.ALL,
  STAGE_SELECTOR_KIND_GROUP_PLACES: StageSelectorKind.GROUP_PLACES,
  STAGE_SELECTOR_KIND_OVERALL_PLACES: StageSelectorKind.OVERALL_PLACES,
};

const layoutMethodDtoToProto: Record<StageLayoutMethodDto, StageLayoutMethod> = {
  STAGE_LAYOUT_METHOD_UNSPECIFIED: StageLayoutMethod.UNSPECIFIED,
  STAGE_LAYOUT_METHOD_SNAKE: StageLayoutMethod.SNAKE,
  STAGE_LAYOUT_METHOD_SEEDED: StageLayoutMethod.SEEDED,
};

/**
 * ruleDtoToProto превращает DTO `SeedingRule` в plain-объект для тела запроса
 * `SetStageRule`/`CreateStage` (спека 0019, FR-1/FR-6). `null`/`undefined` →
 * `undefined` — сообщение целиком не заполняется, presence на проводе решает
 * «правила нет» (снять правило у `SetStageRule`, не задавать при создании).
 */
export function ruleDtoToProto(dto: SeedingRuleDto | null | undefined) {
  if (!dto) return undefined;
  return {
    sourceKind: sourceKindDtoToProto[dto.sourceKind] ?? StageSourceKind.UNSPECIFIED,
    sourceStageId: dto.sourceStageId,
    selector: selectorKindDtoToProto[dto.selector] ?? StageSelectorKind.UNSPECIFIED,
    placeFrom: dto.placeFrom,
    placeTo: dto.placeTo,
    method: layoutMethodDtoToProto[dto.method] ?? StageLayoutMethod.UNSPECIFIED,
  };
}

/**
 * tieResolutionDtoToProto превращает DTO `TieResolution` (ответ организатора
 * на дележ, FR-22) в plain-объект для тела запроса `PreviewStageBuild`/
 * `BuildStage`.
 */
export function tieResolutionDtoToProto(dto: TieResolutionDto) {
  return {
    sourcePoolId: dto.sourcePoolId,
    place: dto.place,
    fighterIds: dto.fighterIds,
  };
}

/** stagesToJson превращает массив protobuf Stage в массив DTO (спека 0017). */
export function stagesToJson(stages: Stage[] | undefined): StageDto[] {
  if (!stages) return [];
  return stages.map((s) => stageToJson(s)).filter((s): s is StageDto => s !== null);
}

/**
 * schemaIssueRawToDto нормализует уже toJson-сериализованный `SchemaIssue`
 * (спека 0020, FR-8) — общая часть между `schemaIssueToJson` и
 * `schemaIssuesToJson`.
 */
function schemaIssueRawToDto(raw: Partial<SchemaIssueDto> | undefined): SchemaIssueDto {
  return {
    severity: (raw?.severity as SchemaIssueSeverityDto) ?? "SCHEMA_ISSUE_SEVERITY_UNSPECIFIED",
    code: (raw?.code as SchemaIssueCodeDto) ?? "SCHEMA_ISSUE_CODE_UNSPECIFIED",
    stageIds: Array.isArray(raw?.stageIds) ? raw.stageIds : [],
    message: raw?.message ?? "",
  };
}

/**
 * schemaIssueToJson превращает protobuf-сообщение SchemaIssue в обычный
 * JSON-объект (спека 0020, FR-8). `message` — готовая строка сервера, клиент
 * её не собирает из `code`/`severity`.
 */
export function schemaIssueToJson(issue: SchemaIssue | undefined): SchemaIssueDto | null {
  if (!issue) return null;
  const raw = toJson(SchemaIssueSchema, issue) as Partial<SchemaIssueDto>;
  return schemaIssueRawToDto(raw);
}

/**
 * schemaIssuesToJson превращает массив protobuf SchemaIssue в массив DTO
 * (спека 0020, FR-8) — используется для `ListStagesResponse.issues`.
 */
export function schemaIssuesToJson(issues: SchemaIssue[] | undefined): SchemaIssueDto[] {
  if (!issues) return [];
  return issues.map((i) => schemaIssueToJson(i)).filter((i): i is SchemaIssueDto => i !== null);
}

/**
 * formatStageSpecRawToDto нормализует уже toJson-сериализованный
 * `FormatStageSpec` (спека 0020, FR-11). В отличие от `Stage.bracket`/
 * `Stage.groups` (nullable — presence решает «правила/конфига нет»),
 * `FormatStageSpec.bracket`/`FormatStageSpec.groups` в DTO НЕ nullable: этап
 * спецификации вне привязки к номинации обязан нести оба поля, поэтому для
 * того, что не относится к типу этапа, подставляется нулевое значение
 * (`{size: 0, thirdPlace: false}` / `{groupCount: 0}`), а не `null`.
 */
function formatStageSpecRawToDto(
  raw:
    | (Partial<FormatStageSpecDto> & {
        bracket?: Partial<BracketConfigDto>;
        groups?: Partial<GroupsConfigDto>;
      })
    | undefined,
): FormatStageSpecDto {
  return {
    title: raw?.title ?? "",
    type: (raw?.type as StageTypeDto) ?? "STAGE_TYPE_UNSPECIFIED",
    bracket: raw?.bracket
      ? { size: raw.bracket.size ?? 0, thirdPlace: raw.bracket.thirdPlace ?? false }
      : { size: 0, thirdPlace: false },
    groups: raw?.groups ? groupsConfigRawToDto(raw.groups) : { groupCount: 0 },
    sourceKind: (raw?.sourceKind as StageSourceKindDto) ?? "STAGE_SOURCE_KIND_UNSPECIFIED",
    sourceIndex: raw?.sourceIndex ?? 0,
    selector: (raw?.selector as StageSelectorKindDto) ?? "STAGE_SELECTOR_KIND_UNSPECIFIED",
    placeFrom: raw?.placeFrom ?? 0,
    placeTo: raw?.placeTo ?? 0,
    method: (raw?.method as StageLayoutMethodDto) ?? "STAGE_LAYOUT_METHOD_UNSPECIFIED",
  };
}

/**
 * formatStageSpecToJson превращает protobuf-сообщение FormatStageSpec в
 * обычный JSON-объект (спека 0020, FR-11).
 */
export function formatStageSpecToJson(spec: FormatStageSpec | undefined): FormatStageSpecDto | null {
  if (!spec) return null;
  const raw = toJson(FormatStageSpecSchema, spec) as Partial<FormatStageSpecDto> & {
    bracket?: Partial<BracketConfigDto>;
    groups?: Partial<GroupsConfigDto>;
  };
  return formatStageSpecRawToDto(raw);
}

/**
 * formatPresetToJson превращает protobuf-сообщение FormatPreset в обычный
 * JSON-объект (спека 0020, FR-11/FR-12). `createdAt`/`updatedAt` — ISO-строки,
 * `toJson` сериализует `Timestamp` сам (как для `Tournament`/`Application`).
 */
export function formatPresetToJson(preset: FormatPreset | undefined): FormatPresetDto | null {
  if (!preset) return null;
  const raw = toJson(FormatPresetSchema, preset) as Partial<FormatPresetDto> & {
    stages?: Array<
      Partial<FormatStageSpecDto> & {
        bracket?: Partial<BracketConfigDto>;
        groups?: Partial<GroupsConfigDto>;
      }
    >;
  };
  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    stages: Array.isArray(raw.stages) ? raw.stages.map(formatStageSpecRawToDto) : [],
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

/**
 * formatPresetsToJson превращает массив protobuf FormatPreset в массив DTO
 * (спека 0020, FR-12) — используется для `ListFormatPresetsResponse.presets`.
 */
export function formatPresetsToJson(presets: FormatPreset[] | undefined): FormatPresetDto[] {
  if (!presets) return [];
  return presets.map((p) => formatPresetToJson(p)).filter((p): p is FormatPresetDto => p !== null);
}

/**
 * poolLayoutToJson превращает protobuf-сообщение PoolLayout в обычный
 * JSON-объект (спека 0009). `status` — строковый литерал; `pools`/
 * `unassigned` — нормализованные массивы (без undefined-полей). Каждый пул
 * несёт свой статус/площадку (спека 0011). `stage` — этап, которому
 * принадлежит раскладка (спека 0017, FR-11).
 */
export function poolLayoutToJson(layout: PoolLayout | undefined): PoolLayoutDto | null {
  if (!layout) return null;
  const raw = toJson(PoolLayoutSchema, layout) as Partial<PoolLayoutDto>;
  return {
    nominationId: raw.nominationId ?? "",
    status: (raw.status as PoolLayoutStatusDto) ?? "POOL_LAYOUT_STATUS_UNSPECIFIED",
    unassigned: Array.isArray(raw.unassigned) ? raw.unassigned.map(poolFighterRefToJson) : [],
    pools: Array.isArray(raw.pools) ? raw.pools.map(poolRawToDto) : [],
    canUndo: raw.canUndo ?? false,
    stage: stageToJson(layout.stage) ?? emptyStageDto(),
  };
}

/**
 * poolToJson превращает protobuf-сообщение Pool (отдельное, не вложенное в
 * PoolLayout) в обычный JSON-объект — используется для `GetPoolsForArena`
 * (seated/available) и `ListPublicPools` (спека 0011).
 */
export function poolToJson(pool: Pool | undefined): PoolDto | null {
  if (!pool) return null;
  const raw = toJson(PoolSchema, pool) as Partial<PoolDto>;
  return poolRawToDto(raw);
}

/** poolsToJson превращает массив protobuf Pool в массив DTO (спека 0011). */
export function poolsToJson(pools: Pool[] | undefined): PoolDto[] {
  if (!pools) return [];
  return pools.map((p) => poolToJson(p)).filter((p): p is PoolDto => p !== null);
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

/**
 * boutForecastRawToDto маппит ориентировочное время боя (спека 0043, ADR
 * 0020). `undefined` — прогноза нет (не заполненное proto-сообщение, та же
 * семантика, что у `LiveFeedBout.started_at/finished_at`) — даёт
 * `expectedStartAt: null`, не эпоху/ноль.
 */
function boutForecastRawToDto(raw: Partial<ForecastDto> | undefined): ForecastDto {
  return {
    expectedStartAt: raw?.expectedStartAt ?? null,
    boutsAhead: raw?.boutsAhead ?? 0,
    provisional: raw?.provisional ?? false,
    imminent: raw?.imminent ?? false,
  };
}

/** paceEstimateRawToDto маппит темп площадки (спека 0043, ADR 0020, п.5). */
function paceEstimateRawToDto(raw: Partial<PaceEstimateDto> | undefined): PaceEstimateDto {
  return {
    tickSeconds: raw?.tickSeconds ?? 0,
    sampleCount: raw?.sampleCount ?? 0,
    provisional: raw?.provisional ?? false,
  };
}

function boardBoutRawToDto(
  raw: (Partial<BoardBoutDto> & { forecast?: Partial<ForecastDto> }) | undefined,
): BoardBoutDto {
  return {
    id: raw?.id ?? "",
    roundNumber: raw?.roundNumber ?? 0,
    sequenceNumber: raw?.sequenceNumber ?? 0,
    fighterA: poolFighterRefToJson(raw?.fighterA),
    fighterB: poolFighterRefToJson(raw?.fighterB),
    state: (raw?.state as BoutStateDto) ?? "BOUT_STATE_UNSPECIFIED",
    scoreA: raw?.scoreA ?? 0,
    scoreB: raw?.scoreB ?? 0,
    forecast: boutForecastRawToDto(raw?.forecast),
  };
}

/**
 * boutBoardToJson превращает protobuf-сообщение BoutBoard в обычный
 * JSON-объект (спека 0013, FR-14): доска ведения боёв арены. `pool` — `null`,
 * если на арене никто не стоит (собственная проекция pool, не entities/bout).
 */
export function boutBoardToJson(board: BoutBoard | undefined): BoutBoardDto | null {
  if (!board) return null;
  const raw = toJson(BoutBoardSchema, board) as Partial<BoutBoardDto> & {
    pool?: Partial<PoolDto>;
  };
  return {
    pool: raw.pool ? poolRawToDto(raw.pool) : null,
    bouts: Array.isArray(raw.bouts) ? raw.bouts.map(boardBoutRawToDto) : [],
    currentBoutId: raw.currentBoutId ?? "",
  };
}

/**
 * journalEntriesToJson превращает `BoutJournalEntry[]` в `JournalEntryDto[]`
 * (спека 0033, FR-33/FR-34): порядок — как отдал сервер (новые первыми, BFF
 * не пересортировывает). `fighterA`/`fighterB` — тот же `hema.v1.FighterRef`,
 * что и в `Pool`/`BoardBout` — нормализуются существующим
 * `poolFighterRefToJson`, вторая копия не заводится. `actorDisplayName` уже
 * обогащено на сервере (`stage.Service.GetArenaJournal`, приём 0025) — здесь
 * только normalize proto3-дефолтов, как `applicationHistoryToJson`.
 */
export function journalEntriesToJson(entries: BoutJournalEntry[] | undefined): JournalEntryDto[] {
  if (!entries) return [];
  return entries.map((e) => {
    const raw = toJson(BoutJournalEntrySchema, e) as Partial<JournalEntryDto> & {
      fighterA?: Partial<PoolFighterRefDto>;
      fighterB?: Partial<PoolFighterRefDto>;
    };
    return {
      boutId: raw.boutId ?? "",
      sequenceNumber: raw.sequenceNumber ?? 0,
      fighterA: poolFighterRefToJson(raw.fighterA),
      fighterB: poolFighterRefToJson(raw.fighterB),
      kind: (raw.kind as JournalEntryKindDto) ?? "BOUT_EVENT_KIND_UNSPECIFIED",
      scoreA: raw.scoreA ?? 0,
      scoreB: raw.scoreB ?? 0,
      occurredAt: raw.occurredAt ?? "",
      actorDisplayName: raw.actorDisplayName ?? "",
    };
  });
}

function bracketSlotRawToDto(raw: Partial<BracketSlotDto> | undefined): BracketSlotDto {
  return {
    slot: raw?.slot ?? 0,
    state: (raw?.state as BracketSlotStateDto) ?? "BRACKET_SLOT_STATE_UNSPECIFIED",
    fighter: poolFighterRefToJson(raw?.fighter),
    sourceLabel: raw?.sourceLabel ?? "",
  };
}

function bracketPairRawToDto(raw: Partial<BracketPairDto> | undefined): BracketPairDto {
  return {
    index: raw?.index ?? 0,
    slotA: bracketSlotRawToDto(raw?.slotA),
    slotB: bracketSlotRawToDto(raw?.slotB),
    bout: raw?.bout ? boardBoutRawToDto(raw.bout) : null,
    resolved: raw?.resolved ?? false,
  };
}

function bracketHalfRawToDto(raw: Partial<BracketHalfDto> | undefined): BracketHalfDto {
  return {
    half: raw?.half ?? 0,
    title: raw?.title ?? "",
    container: poolRawToDto(raw?.container),
    pairs: Array.isArray(raw?.pairs) ? raw.pairs.map(bracketPairRawToDto) : [],
    currentBoutId: raw?.currentBoutId ?? "",
  };
}

function bracketRoundRawToDto(raw: Partial<BracketRoundDto> | undefined): BracketRoundDto {
  return {
    number: raw?.number ?? 0,
    title: raw?.title ?? "",
    thirdPlace: raw?.thirdPlace ?? false,
    halves: Array.isArray(raw?.halves) ? raw.halves.map(bracketHalfRawToDto) : [],
  };
}

/**
 * bracketToJson превращает protobuf-сообщение Bracket в обычный JSON-объект
 * (спека 0018, FR-19/FR-20): дерево кругов/половин/пар/слотов сетки, готовое
 * к отрисовке `widgets/bracket-view`. По образцу `poolLayoutToJson`/
 * `boutBoardToJson` — вложенные `Pool`/`BoardBout` пробрасывает через
 * существующие `poolRawToDto`/`boardBoutRawToDto`, не заводит вторую копию
 * нормализации. `champion`/`thirdPlaceWinner` — `null`, пока финал/бой за
 * 3-е место не завершены (FR-20).
 */
export function bracketToJson(bracket: Bracket | undefined): BracketDto | null {
  if (!bracket) return null;
  const raw = toJson(BracketSchema, bracket) as Partial<BracketDto> & {
    rounds?: Array<Partial<BracketRoundDto>>;
    unassigned?: Array<Partial<PoolFighterRefDto>>;
    champion?: Partial<PoolFighterRefDto>;
    thirdPlaceWinner?: Partial<PoolFighterRefDto>;
  };
  return {
    stage: stageToJson(bracket.stage) ?? emptyStageDto(),
    rounds: Array.isArray(raw.rounds) ? raw.rounds.map(bracketRoundRawToDto) : [],
    unassigned: Array.isArray(raw.unassigned) ? raw.unassigned.map(poolFighterRefToJson) : [],
    canUndo: raw.canUndo ?? false,
    champion: raw.champion ? poolFighterRefToJson(raw.champion) : null,
    thirdPlaceWinner: raw.thirdPlaceWinner ? poolFighterRefToJson(raw.thirdPlaceWinner) : null,
  };
}

function nominationResultEntryRawToDto(
  raw: Partial<NominationResultEntryDto> | undefined,
): NominationResultEntryDto {
  return {
    placeFrom: raw?.placeFrom ?? 0,
    placeTo: raw?.placeTo ?? 0,
    fighter: poolFighterRefToJson(raw?.fighter),
    originLabel: raw?.originLabel ?? "",
  };
}

function nominationResultsSectionRawToDto(
  raw: Partial<NominationResultsSectionDto> | undefined,
): NominationResultsSectionDto {
  return {
    stageId: raw?.stageId ?? "",
    stageTitle: raw?.stageTitle ?? "",
    stageType: (raw?.stageType as StageTypeDto) ?? "STAGE_TYPE_UNSPECIFIED",
    finished: raw?.finished ?? false,
    entries: Array.isArray(raw?.entries) ? raw.entries.map(nominationResultEntryRawToDto) : [],
    placesFromOverallOrder: raw?.placesFromOverallOrder ?? false,
  };
}

/**
 * nominationResultsToJson превращает protobuf-сообщение NominationResults в
 * обычный JSON-объект (спека 0021, FR-9..FR-15): итоговый протокол номинации
 * — секция на каждый терминальный этап (FR-10). Используется и для ответа
 * `GetNominationResults` (T11), и для поля `results` живого снапшота
 * номинации (`nominationLiveToJson`, FR-18).
 */
export function nominationResultsToJson(
  results: NominationResults | undefined,
): NominationResultsDto | null {
  if (!results) return null;
  const raw = toJson(NominationResultsSchema, results) as Partial<NominationResultsDto>;
  return {
    nominationId: raw.nominationId ?? "",
    nominationFinished: raw.nominationFinished ?? false,
    sections: Array.isArray(raw.sections) ? raw.sections.map(nominationResultsSectionRawToDto) : [],
  };
}

/**
 * nominationLiveToJson превращает protobuf-сообщение NominationLiveSnapshot
 * в обычный JSON-объект (спека 0014): живой снапшот номинации — пулы готовой
 * раскладки (пусто при `draft`, FR-12) с их боями (состояние/счёт/текущий
 * бой). По образцу `boutBoardToJson`, нормализует вложенные `Pool`/`BoardBout`
 * теми же приватными хелперами. `stages` — этапы номинации (спека 0017,
 * FR-11). `brackets` — плейофф-сетки номинации (спека 0018, FR-19),
 * нормализуются `bracketToJson` на исходных proto-подсообщениях `snapshot`
 * (как `stages` — не на уже-toJson'нутом `raw`). `results` — итоговый
 * протокол номинации (спека 0021, FR-18): едет тем же живым каналом, чтобы
 * призёры появлялись без перезагрузки; фолбэк — пустой протокол, если
 * сервер поле не заполнил.
 */
export function nominationLiveToJson(
  snapshot: NominationLiveSnapshot | undefined,
): NominationLiveSnapshotDto | null {
  if (!snapshot) return null;
  const raw = toJson(NominationLiveSnapshotSchema, snapshot) as Partial<NominationLiveSnapshotDto> & {
    pools?: Array<{ pool?: Partial<PoolDto>; bouts?: unknown[]; currentBoutId?: string }>;
  };
  return {
    nominationId: raw.nominationId ?? "",
    pools: Array.isArray(raw.pools)
      ? raw.pools.map(
          (p): LivePoolDto => ({
            pool: poolRawToDto(p.pool),
            bouts: Array.isArray(p.bouts) ? (p.bouts as Partial<BoardBoutDto>[]).map(boardBoutRawToDto) : [],
            currentBoutId: p.currentBoutId ?? "",
          }),
        )
      : [],
    stages: stagesToJson(snapshot.stages),
    brackets: (snapshot.brackets ?? [])
      .map((b) => bracketToJson(b))
      .filter((b): b is BracketDto => b !== null),
    results: nominationResultsToJson(snapshot.results) ?? emptyNominationResults(raw.nominationId ?? ""),
  };
}

function timerFrameRawToDto(raw: Partial<TimerFrameDto> | undefined, defaultCsFallback: number): TimerFrameDto {
  return {
    status: (raw?.status as TimerStatusDto) ?? "TIMER_STATUS_STOPPED",
    remainingCs: raw?.remainingCs ?? defaultCsFallback,
    sampledUnixMs: raw?.sampledUnixMs ?? "0",
    defaultCs: raw?.defaultCs ?? defaultCsFallback,
  };
}

function scoreboardRoomRawToDto(raw: Partial<ScoreboardRoomDto> | undefined): ScoreboardRoomDto {
  return {
    scoreboardCount: raw?.scoreboardCount ?? 0,
    thisOrdinal: raw?.thisOrdinal ?? 0,
    thisIsSource: raw?.thisIsSource ?? false,
    sidesSwapped: raw?.sidesSwapped ?? false,
    revealGeneration: raw?.revealGeneration ?? 0,
  };
}

/**
 * timerCommandToJson превращает protobuf-сообщение TimerCommand в обычный
 * JSON-объект (спека 0015, FR-7): используется для ретранслируемого события
 * `command` в `WatchArenaBoardResponse` (панель → авторитетное табло).
 */
export function timerCommandToJson(command: TimerCommand | undefined): TimerCommandDto | null {
  if (!command) return null;
  const raw = toJson(TimerCommandSchema, command) as Partial<TimerCommandDto>;
  return {
    kind: (raw.kind as TimerCommandKindDto) ?? "TIMER_COMMAND_KIND_UNSPECIFIED",
    amountSeconds: raw.amountSeconds ?? 0,
  };
}

/**
 * arenaLiveToJson превращает protobuf-сообщение ArenaLiveSnapshot в обычный
 * JSON-объект (спека 0015): живой снапшот табло арены — доска (переиспользует
 * `boutBoardToJson`, как есть, на самом proto-подсообщении `snapshot.board`,
 * не на уже-toJson'нутом `raw`), последний известный кадр таймера, состав
 * комнаты и персистентный дефолт арены (для инициализации/сброса у
 * авторитетного табло, ADR 0013). `sampledUnixMs`/`serverNowUnixMs` — int64,
 * `toJson` сериализует их строкой (см. `TimerFrameDto`).
 */
export function arenaLiveToJson(snapshot: ArenaLiveSnapshot | undefined): ArenaLiveSnapshotDto | null {
  if (!snapshot) return null;
  const raw = toJson(ArenaLiveSnapshotSchema, snapshot) as Partial<ArenaLiveSnapshotDto> & {
    timer?: Partial<TimerFrameDto>;
    room?: Partial<ScoreboardRoomDto>;
  };
  const defaultDurationSeconds = raw.defaultDurationSeconds || 90;
  return {
    board: boutBoardToJson(snapshot.board),
    timer: timerFrameRawToDto(raw.timer, defaultDurationSeconds * 100),
    room: scoreboardRoomRawToDto(raw.room),
    defaultDurationSeconds,
    serverNowUnixMs: raw.serverNowUnixMs ?? "0",
  };
}

// LiveArenaState/LiveNominationPhase — proto enum значения сериализуются
// toJson полным именем (`LIVE_ARENA_STATE_FREE`, ...), а
// `entities/tournament-live/lib/types.ts` держит их короткими lowercase
// литералами без UNSPECIFIED (`"free"`, `"upcoming"`, ...) — своя ось
// представления, не зеркало proto-имени (в отличие от `BoutState`/
// `PoolStatus`, которые DTO хранят как есть). UNSPECIFIED падает в тот же
// нейтральный вариант, что и явный ноль состояния (`FREE`/`UPCOMING`).
function liveArenaStateToDto(raw: string | undefined): LiveArenaStateDto {
  switch (raw) {
    case "LIVE_ARENA_STATE_PREPARING":
      return "preparing";
    case "LIVE_ARENA_STATE_BOUT_IN_PROGRESS":
      return "bout_in_progress";
    default:
      return "free";
  }
}

function liveNominationPhaseToDto(raw: string | undefined): LiveNominationPhaseDto {
  switch (raw) {
    case "LIVE_NOMINATION_PHASE_RUNNING":
      return "running";
    case "LIVE_NOMINATION_PHASE_FINISHED":
      return "finished";
    default:
      return "upcoming";
  }
}

function liveFeedBoutRawToDto(
  raw:
    | (Partial<LiveFeedBoutDto> & {
        fighterA?: Partial<PoolFighterRefDto>;
        fighterB?: Partial<PoolFighterRefDto>;
        forecast?: Partial<ForecastDto>;
      })
    | undefined,
): LiveFeedBoutDto {
  return {
    boutId: raw?.boutId ?? "",
    nominationId: raw?.nominationId ?? "",
    nominationName: raw?.nominationName ?? "",
    stageTitle: raw?.stageTitle ?? "",
    poolName: raw?.poolName ?? "",
    arenaId: raw?.arenaId ?? "",
    arenaName: raw?.arenaName ?? "",
    sequenceNumber: raw?.sequenceNumber ?? 0,
    poolBoutTotal: raw?.poolBoutTotal ?? 0,
    fighterA: poolFighterRefToJson(raw?.fighterA),
    fighterB: poolFighterRefToJson(raw?.fighterB),
    state: (raw?.state as BoutStateDto) ?? "BOUT_STATE_UNSPECIFIED",
    scoreA: raw?.scoreA ?? 0,
    scoreB: raw?.scoreB ?? 0,
    startedAt: raw?.startedAt ?? null,
    finishedAt: raw?.finishedAt ?? null,
    forecast: boutForecastRawToDto(raw?.forecast),
  };
}

function liveArenaRawToDto(
  raw:
    | (Partial<LiveArenaDto> & {
        state?: string;
        currentBout?: Partial<LiveFeedBoutDto> & {
          fighterA?: Partial<PoolFighterRefDto>;
          fighterB?: Partial<PoolFighterRefDto>;
          forecast?: Partial<ForecastDto>;
        };
        nextBoutForecast?: Partial<ForecastDto>;
      })
    | undefined,
): LiveArenaDto {
  return {
    arenaId: raw?.arenaId ?? "",
    arenaName: raw?.arenaName ?? "",
    position: raw?.position ?? 0,
    state: liveArenaStateToDto(raw?.state),
    nominationId: raw?.nominationId ?? "",
    nominationName: raw?.nominationName ?? "",
    poolName: raw?.poolName ?? "",
    stageTitle: raw?.stageTitle ?? "",
    currentBout: raw?.currentBout ? liveFeedBoutRawToDto(raw.currentBout) : null,
    poolBoutTotal: raw?.poolBoutTotal ?? 0,
    poolBoutFinished: raw?.poolBoutFinished ?? 0,
    nextBoutForecast: boutForecastRawToDto(raw?.nextBoutForecast),
  };
}

function liveNominationRawToDto(
  raw: (Partial<LiveNominationDto> & { phase?: string }) | undefined,
): LiveNominationDto {
  return {
    nominationId: raw?.nominationId ?? "",
    title: raw?.title ?? "",
    position: raw?.position ?? 0,
    phase: liveNominationPhaseToDto(raw?.phase),
    currentStageTitle: raw?.currentStageTitle ?? "",
    boutTotal: raw?.boutTotal ?? 0,
    boutFinished: raw?.boutFinished ?? 0,
    fighterCount: raw?.fighterCount ?? 0,
  };
}

/**
 * tournamentLiveToJson превращает protobuf-сообщение TournamentLiveSnapshot
 * в обычный JSON-объект (спека 0034): живая сводка турнира целиком —
 * площадки, лента боёв и положение номинаций. По образцу
 * `nominationLiveToJson`/`arenaLiveToJson`: `toJson` даёт plain JSON с
 * proto-именами enum'ов и int64-строками, приватные `*RawToDto` хелперы
 * нормализуют вложенные сообщения и сводят enum'ы к короткой оси DTO
 * (`liveArenaStateToDto`/`liveNominationPhaseToDto`). Порядок ленты (FR-17)
 * и её фильтрация (FR-18) — не забота этой функции, считаются на клиенте
 * (`entities/tournament-live/lib/feed.ts`).
 */
export function tournamentLiveToJson(
  snapshot: TournamentLiveSnapshot | undefined,
): TournamentLiveSnapshotDto | null {
  if (!snapshot) return null;
  const raw = toJson(TournamentLiveSnapshotSchema, snapshot) as Partial<TournamentLiveSnapshotDto> & {
    arenas?: unknown[];
    bouts?: unknown[];
    nominations?: unknown[];
  };
  return {
    tournamentId: raw.tournamentId ?? "",
    arenas: Array.isArray(raw.arenas) ? raw.arenas.map((a) => liveArenaRawToDto(a as never)) : [],
    bouts: Array.isArray(raw.bouts) ? raw.bouts.map((b) => liveFeedBoutRawToDto(b as never)) : [],
    nominations: Array.isArray(raw.nominations)
      ? raw.nominations.map((n) => liveNominationRawToDto(n as never))
      : [],
    serverNowUnixMs: raw.serverNowUnixMs ?? "0",
  };
}

// ---------------------------------------------------------------------
// Спека 0043: пульт турнира (ADR 0020).
// ---------------------------------------------------------------------

/** arenaIdleStateToDto маппит простой площадки (FR-26/FR-28) в короткую ось DTO. */
function arenaIdleStateToDto(raw: string | undefined): ArenaIdleStateDto {
  switch (raw) {
    case "ARENA_IDLE_STATE_WAITING_FIRST_POOL":
      return "waiting_first_pool";
    case "ARENA_IDLE_STATE_FREE":
      return "free";
    default:
      return "occupied";
  }
}

/** consoleAlertKindToDto маппит вид записи ленты внимания (FR-15) в короткую ось DTO. */
function consoleAlertKindToDto(raw: string | undefined): ConsoleAlertKindDto {
  switch (raw) {
    case "CONSOLE_ALERT_KIND_BOUT_STUCK":
      return "bout_stuck";
    case "CONSOLE_ALERT_KIND_POOL_NOT_STARTED":
      return "pool_not_started";
    case "CONSOLE_ALERT_KIND_POOL_DONE_NOT_UNSEATED":
      return "pool_done_not_unseated";
    case "CONSOLE_ALERT_KIND_NEXT_STAGE_NOT_BUILT":
      return "next_stage_not_built";
    case "CONSOLE_ALERT_KIND_NOMINATION_STALLED":
      return "nomination_stalled";
    default:
      return "arena_idle";
  }
}

function consoleArenaRawToDto(
  raw:
    | (Partial<ConsoleArenaDto> & {
        idleState?: string;
        currentBout?: Partial<BoardBoutDto> & {
          fighterA?: Partial<PoolFighterRefDto>;
          fighterB?: Partial<PoolFighterRefDto>;
          forecast?: Partial<ForecastDto>;
        };
        pace?: Partial<PaceEstimateDto>;
      })
    | undefined,
): ConsoleArenaDto {
  return {
    arenaId: raw?.arenaId ?? "",
    arenaName: raw?.arenaName ?? "",
    position: raw?.position ?? 0,
    idleState: arenaIdleStateToDto(raw?.idleState),
    freeSince: raw?.freeSince ?? null,
    nominationId: raw?.nominationId ?? "",
    nominationName: raw?.nominationName ?? "",
    stageTitle: raw?.stageTitle ?? "",
    poolId: raw?.poolId ?? "",
    poolName: raw?.poolName ?? "",
    currentBout: raw?.currentBout ? boardBoutRawToDto(raw.currentBout) : null,
    boutTotal: raw?.boutTotal ?? 0,
    boutFinished: raw?.boutFinished ?? 0,
    pace: raw?.pace ? paceEstimateRawToDto(raw.pace) : null,
    poolExpectedFinishAt: raw?.poolExpectedFinishAt ?? null,
  };
}

function consoleNominationRawToDto(
  raw: (Partial<ConsoleNominationDto> & { phase?: string }) | undefined,
): ConsoleNominationDto {
  return {
    nominationId: raw?.nominationId ?? "",
    title: raw?.title ?? "",
    position: raw?.position ?? 0,
    phase: liveNominationPhaseToDto(raw?.phase),
    currentStageTitle: raw?.currentStageTitle ?? "",
    boutTotal: raw?.boutTotal ?? 0,
    boutFinished: raw?.boutFinished ?? 0,
    boutRemainingUnseated: raw?.boutRemainingUnseated ?? 0,
    expectedFinishAt: raw?.expectedFinishAt ?? null,
    provisional: raw?.provisional ?? false,
  };
}

function consoleQueueItemRawToDto(raw: Partial<ConsoleQueueItemDto> | undefined): ConsoleQueueItemDto {
  return {
    poolId: raw?.poolId ?? "",
    nominationId: raw?.nominationId ?? "",
    nominationName: raw?.nominationName ?? "",
    stageTitle: raw?.stageTitle ?? "",
    poolName: raw?.poolName ?? "",
    boutCount: raw?.boutCount ?? 0,
    estimatedSeconds: raw?.estimatedSeconds ?? 0,
  };
}

function consoleAlertRawToDto(
  raw: (Partial<ConsoleAlertDto> & { kind?: string }) | undefined,
): ConsoleAlertDto {
  return {
    kind: consoleAlertKindToDto(raw?.kind),
    since: raw?.since ?? "",
    arenaId: raw?.arenaId ?? "",
    arenaName: raw?.arenaName ?? "",
    nominationId: raw?.nominationId ?? "",
    nominationName: raw?.nominationName ?? "",
    poolId: raw?.poolId ?? "",
    poolName: raw?.poolName ?? "",
    boutId: raw?.boutId ?? "",
  };
}

/**
 * consoleSnapshotToJson превращает protobuf-сообщение
 * TournamentConsoleSnapshot в обычный JSON-объект (спека 0043): пульт
 * турнира целиком — площадки, номинации, очередь, лента внимания. По
 * образцу `tournamentLiveToJson`.
 */
export function consoleSnapshotToJson(
  snapshot: TournamentConsoleSnapshot | undefined,
): TournamentConsoleSnapshotDto | null {
  if (!snapshot) return null;
  const raw = toJson(TournamentConsoleSnapshotSchema, snapshot) as Partial<TournamentConsoleSnapshotDto> & {
    arenas?: unknown[];
    nominations?: unknown[];
    queue?: unknown[];
    alerts?: unknown[];
  };
  return {
    tournamentId: raw.tournamentId ?? "",
    arenas: Array.isArray(raw.arenas) ? raw.arenas.map((a) => consoleArenaRawToDto(a as never)) : [],
    nominations: Array.isArray(raw.nominations)
      ? raw.nominations.map((n) => consoleNominationRawToDto(n as never))
      : [],
    queue: Array.isArray(raw.queue) ? raw.queue.map((q) => consoleQueueItemRawToDto(q as never)) : [],
    alerts: Array.isArray(raw.alerts) ? raw.alerts.map((al) => consoleAlertRawToDto(al as never)) : [],
    serverNowUnixMs: raw.serverNowUnixMs ?? "0",
  };
}
