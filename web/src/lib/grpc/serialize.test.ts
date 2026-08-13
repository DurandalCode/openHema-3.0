import { describe, it, expect } from "vitest";
import { fromJson } from "@bufbuild/protobuf";
import { UserSchema } from "@/gen/hema/v1/common_pb";
import { TournamentSchema } from "@/gen/hema/v1/tournament_pb";
import { NominationSchema } from "@/gen/hema/v1/nomination_pb";
import {
  ApplicationSchema,
  ApplicationEventSchema,
  NominationParticipantSchema,
} from "@/gen/hema/v1/application_pb";
import { ArenaSchema } from "@/gen/hema/v1/arena_pb";
import { FighterSchema } from "@/gen/hema/v1/fighter_pb";
import {
  NominationLiveSnapshotSchema,
  ArenaLiveSnapshotSchema,
  PoolSchema,
  PoolLayoutSchema,
  StageSchema,
  BracketSchema,
  SeedingRuleSchema,
  StageBuildPreviewSchema,
  SchemaIssueSchema,
  FormatStageSpecSchema,
  FormatPresetSchema,
  NominationResultsSchema,
} from "@/gen/hema/v1/stage_pb";
import {
  applicationHistoryToJson,
  applicationsToJson,
  applicationToJson,
  arenaToJson,
  arenasToJson,
  arenaLiveToJson,
  bracketToJson,
  fighterToJson,
  formatPresetsToJson,
  formatPresetToJson,
  formatStageSpecToJson,
  nominationParticipantsToJson,
  nominationsToJson,
  nominationToJson,
  nominationLiveToJson,
  nominationResultsToJson,
  poolLayoutToJson,
  poolToJson,
  ruleDtoToProto,
  schemaIssuesToJson,
  schemaIssueToJson,
  seedingRuleToJson,
  stageBuildPreviewToJson,
  stageToJson,
  tieResolutionDtoToProto,
  tournamentToJson,
  userToJson,
} from "@/lib/grpc/serialize";

type UserJson = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
};

type TournamentJson = {
  id: string;
  title: string;
  description: string;
  eventStartAt?: string;
  eventEndAt?: string;
  emblemUrl: string;
  isActive: boolean;
  contacts: { id: string; type: string; value: string; position: number }[];
  createdAt: string;
  updatedAt: string;
};

describe("userToJson", () => {
  it("converts a protobuf User to plain JSON", () => {
    const user = fromJson(UserSchema, {
      id: "user-123",
      email: "knight@hema.test",
      displayName: "Sir Test",
      role: "ROLE_ADMIN",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const json = userToJson(user) as UserJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("user-123");
    expect(json.email).toBe("knight@hema.test");
    expect(json.displayName).toBe("Sir Test");
    expect(json.role).toBe("ROLE_ADMIN");
    expect(json.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("returns null for undefined", () => {
    expect(userToJson(undefined)).toBeNull();
  });
});

describe("tournamentToJson", () => {
  it("converts a protobuf Tournament with contacts to plain JSON (single-day)", () => {
    const t = fromJson(TournamentSchema, {
      id: "t1",
      title: "HEMA Cup",
      description: "Annual",
      eventStartAt: "2026-12-01T10:00:00Z",
      emblemUrl: "https://cdn/x.png",
      isActive: true,
      contacts: [
        { id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org", position: 0 },
      ],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-07-07T00:00:00Z",
    });

    const json = tournamentToJson(t) as TournamentJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("t1");
    expect(json.title).toBe("HEMA Cup");
    expect(json.eventStartAt).toBe("2026-12-01T10:00:00Z");
    expect(json.eventEndAt).toBe("");
    expect(json.emblemUrl).toBe("https://cdn/x.png");
    expect(json.isActive).toBe(true);
    expect(json.contacts).toEqual([
      { id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org", position: 0 },
    ]);
  });

  it("converts a multi-day tournament (start + end)", () => {
    const t = fromJson(TournamentSchema, {
      id: "t2",
      title: "HEMA festival",
      eventStartAt: "2026-12-01T10:00:00Z",
      eventEndAt: "2026-12-03T18:00:00Z",
    });
    const json = tournamentToJson(t) as TournamentJson;
    expect(json.eventStartAt).toBe("2026-12-01T10:00:00Z");
    expect(json.eventEndAt).toBe("2026-12-03T18:00:00Z");
  });

  it("returns null for undefined", () => {
    expect(tournamentToJson(undefined)).toBeNull();
  });

  // Регрессия: proto3-дефолты (пустые строки, пустой repeated) опускаются
  // toJson, и BFF отдаёт JSON без title/description/emblemUrl/contacts.
  // Consumer (TournamentHero) зовёт `.contacts.filter(...)` → undefined →
  // краш страницы. tournamentToJson обязан нормализовать дефолты.
  it("normalizes proto3 defaults for empty/seed tournament", () => {
    // Сид активного турнира: только id, isActive, timestamps; всё остальное —
    // proto3-дефолты, которые toJson опускает.
    const t = fromJson(TournamentSchema, {
      id: "00000000-0000-0000-0000-000000000001",
      isActive: true,
      createdAt: "2026-07-07T00:00:00Z",
      updatedAt: "2026-07-07T00:00:00Z",
    });

    const json = tournamentToJson(t) as TournamentJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(json.title).toBe("");
    expect(json.description).toBe("");
    expect(json.emblemUrl).toBe("");
    expect(json.isActive).toBe(true);
    expect(Array.isArray(json.contacts)).toBe(true);
    expect(json.contacts).toEqual([]);
    expect(json.createdAt).toBe("2026-07-07T00:00:00Z");
    expect(json.updatedAt).toBe("2026-07-07T00:00:00Z");
  });

  it("normalizes missing contacts array even when other fields set", () => {
    const t = fromJson(TournamentSchema, {
      id: "t2",
      title: "Cup",
    });

    const json = tournamentToJson(t) as TournamentJson;

    expect(json.contacts).toEqual([]);
    expect(json.title).toBe("Cup");
    expect(json.description).toBe("");
    expect(json.emblemUrl).toBe("");
  });
});

type NominationJson = {
  id: string;
  tournamentId: string;
  title: string;
  description: string;
  fighterCapacity: number | null;
  metadata: { rulesUrl: string };
  position: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

describe("nominationToJson", () => {
  it("converts a filled protobuf Nomination to plain JSON", () => {
    const n = fromJson(NominationSchema, {
      id: "n1",
      tournamentId: "t1",
      title: "Лонгсворд",
      description: "Основная номинация",
      fighterCapacity: 16,
      metadata: { rulesUrl: "https://example.com/rules" },
      position: 0,
      status: "NOMINATION_STATUS_OPEN",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-07-07T00:00:00Z",
    });

    const json = nominationToJson(n) as NominationJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("n1");
    expect(json.tournamentId).toBe("t1");
    expect(json.title).toBe("Лонгсворд");
    expect(json.fighterCapacity).toBe(16);
    expect(json.metadata).toEqual({ rulesUrl: "https://example.com/rules" });
    expect(json.position).toBe(0);
    expect(json.status).toBe("NOMINATION_STATUS_OPEN");
  });

  it("returns null for undefined", () => {
    expect(nominationToJson(undefined)).toBeNull();
  });

  // Регрессия presence: fighterCapacity не задан (proto3 optional) должен
  // отличаться от заданного нуля — иначе UI не сможет показать «не задано».
  it("normalizes unset fighterCapacity to null (distinct from 0)", () => {
    const n = fromJson(NominationSchema, {
      id: "n1",
      tournamentId: "t1",
      title: "T",
    });

    const json = nominationToJson(n) as NominationJson;

    expect(json.fighterCapacity).toBeNull();
  });

  it("preserves explicit zero fighterCapacity", () => {
    const n = fromJson(NominationSchema, {
      id: "n1",
      tournamentId: "t1",
      title: "T",
      fighterCapacity: 0,
    });

    const json = nominationToJson(n) as NominationJson;

    expect(json.fighterCapacity).toBe(0);
  });

  // Регрессия proto3-omitted: пустой title/description/metadata.rulesUrl
  // опускаются toJson — consumer (карточка номинации) ждёт строки.
  it("normalizes proto3 defaults for a minimal nomination", () => {
    const n = fromJson(NominationSchema, {
      id: "n1",
      tournamentId: "t1",
      title: "T",
    });

    const json = nominationToJson(n) as NominationJson;

    expect(json.description).toBe("");
    expect(json.metadata).toEqual({ rulesUrl: "" });
    expect(json.position).toBe(0);
    expect(json.status).toBe("NOMINATION_STATUS_UNSPECIFIED");
    expect(json.createdAt).toBe("");
    expect(json.updatedAt).toBe("");
  });

  // Регрессия proto3-enum-omitted (спека 0012, FR-8): статус не задан →
  // enum-дефолт 0 (UNSPECIFIED), toJson опускает поле совсем — consumer
  // (бейдж статуса) ждёт строковый литерал, не undefined.
  it("normalizes unset status to NOMINATION_STATUS_UNSPECIFIED", () => {
    const n = fromJson(NominationSchema, {
      id: "n1",
      tournamentId: "t1",
      title: "T",
    });

    const json = nominationToJson(n) as NominationJson;

    expect(json.status).toBe("NOMINATION_STATUS_UNSPECIFIED");
  });

  it("preserves NOMINATION_STATUS_CLOSED", () => {
    const n = fromJson(NominationSchema, {
      id: "n1",
      tournamentId: "t1",
      title: "T",
      status: "NOMINATION_STATUS_CLOSED",
    });

    const json = nominationToJson(n) as NominationJson;

    expect(json.status).toBe("NOMINATION_STATUS_CLOSED");
  });
});

describe("nominationsToJson", () => {
  it("converts an array of protobuf Nominations", () => {
    const a = fromJson(NominationSchema, { id: "a", tournamentId: "t1", title: "A" });
    const b = fromJson(NominationSchema, { id: "b", tournamentId: "t1", title: "B" });

    const json = nominationsToJson([a, b]);

    expect(json).toHaveLength(2);
    expect(json[0].id).toBe("a");
    expect(json[1].id).toBe("b");
  });

  it("returns empty array for undefined", () => {
    expect(nominationsToJson(undefined)).toEqual([]);
  });
});

describe("applicationToJson", () => {
  it("converts a protobuf Application to plain JSON", () => {
    const app = fromJson(ApplicationSchema, {
      id: "app-1",
      nominationId: "nom-1",
      tournamentId: "t1",
      applicantUserId: "user-1",
      applicantDisplayName: "Fighter One",
      state: "APPLICATION_STATE_SUBMITTED",
      club: "Sokol",
      needsEquipment: true,
    });

    const json = applicationToJson(app);

    expect(json).not.toBeNull();
    expect(json?.id).toBe("app-1");
    expect(json?.nominationId).toBe("nom-1");
    expect(json?.applicantDisplayName).toBe("Fighter One");
    expect(json?.state).toBe("APPLICATION_STATE_SUBMITTED");
    expect(json?.club).toBe("Sokol");
    expect(json?.needsEquipment).toBe(true);
  });

  it("defaults club to empty string and needsEquipment to false when unset", () => {
    const app = fromJson(ApplicationSchema, { id: "app-2", state: "APPLICATION_STATE_SUBMITTED" });

    const json = applicationToJson(app);

    expect(json?.club).toBe("");
    expect(json?.needsEquipment).toBe(false);
  });

  it("returns null for undefined", () => {
    expect(applicationToJson(undefined)).toBeNull();
  });
});

describe("applicationsToJson", () => {
  it("converts an array of protobuf Applications", () => {
    const a = fromJson(ApplicationSchema, { id: "a", state: "APPLICATION_STATE_SUBMITTED" });
    const b = fromJson(ApplicationSchema, { id: "b", state: "APPLICATION_STATE_PAID" });

    const json = applicationsToJson([a, b]);

    expect(json).toHaveLength(2);
    expect(json[0].id).toBe("a");
    expect(json[1].state).toBe("APPLICATION_STATE_PAID");
  });

  it("returns empty array for undefined", () => {
    expect(applicationsToJson(undefined)).toEqual([]);
  });
});

describe("applicationHistoryToJson", () => {
  it("converts an array of protobuf ApplicationEvent", () => {
    const ev = fromJson(ApplicationEventSchema, {
      type: "APPLICATION_EVENT_TYPE_SUBMITTED",
      actorId: "user-1",
      sequence: 1,
      actorDisplayName: "Кораблёва Анна",
    });

    const json = applicationHistoryToJson([ev]);

    expect(json).toHaveLength(1);
    expect(json[0].type).toBe("APPLICATION_EVENT_TYPE_SUBMITTED");
    expect(json[0].actorId).toBe("user-1");
    expect(json[0].sequence).toBe(1);
    expect(json[0].actorDisplayName).toBe("Кораблёва Анна");
  });

  it("defaults actorDisplayName to empty string when the proto3 field is omitted", () => {
    const ev = fromJson(ApplicationEventSchema, {
      type: "APPLICATION_EVENT_TYPE_SUBMITTED",
      actorId: "user-1",
      sequence: 1,
    });

    const json = applicationHistoryToJson([ev]);

    expect(json[0].actorDisplayName).toBe("");
  });

  it("returns empty array for undefined", () => {
    expect(applicationHistoryToJson(undefined)).toEqual([]);
  });
});

describe("nominationParticipantsToJson", () => {
  it("converts an array of protobuf NominationParticipant", () => {
    const p = fromJson(NominationParticipantSchema, {
      displayName: "Fighter One",
      state: "APPLICATION_STATE_REGISTERED",
    });

    const json = nominationParticipantsToJson([p]);

    expect(json).toHaveLength(1);
    expect(json[0].displayName).toBe("Fighter One");
    expect(json[0].state).toBe("APPLICATION_STATE_REGISTERED");
  });

  it("returns empty array for undefined", () => {
    expect(nominationParticipantsToJson(undefined)).toEqual([]);
  });
});

describe("fighterToJson", () => {
  it("converts a protobuf Fighter to plain JSON, carrying fromApplication", () => {
    const f = fromJson(FighterSchema, {
      id: "f1",
      tournamentId: "t1",
      name: "Ivan",
      club: "Sokol",
      status: "FIGHTER_STATUS_ACTIVE",
      fromApplication: true,
    });

    const json = fighterToJson(f);

    expect(json).not.toBeNull();
    expect(json?.id).toBe("f1");
    expect(json?.fromApplication).toBe(true);
  });

  it("defaults fromApplication to false when the proto3 field is omitted", () => {
    const f = fromJson(FighterSchema, { id: "f2", name: "Petr" });

    const json = fighterToJson(f);

    expect(json?.fromApplication).toBe(false);
  });

  it("returns null for undefined", () => {
    expect(fighterToJson(undefined)).toBeNull();
  });
});

type ArenaJson = {
  id: string;
  tournamentId: string;
  name: string;
  description: string;
  position: number;
  status: string;
  defaultDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
};

describe("arenaToJson", () => {
  it("converts a filled protobuf Arena to plain JSON", () => {
    const a = fromJson(ArenaSchema, {
      id: "a1",
      tournamentId: "t1",
      name: "Ристалище 1",
      description: "У входа",
      position: 2,
      status: "ARENA_STATUS_ACTIVE",
      defaultDurationSeconds: 120,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-07-07T00:00:00Z",
    });

    const json = arenaToJson(a) as ArenaJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("a1");
    expect(json.tournamentId).toBe("t1");
    expect(json.name).toBe("Ристалище 1");
    expect(json.description).toBe("У входа");
    expect(json.position).toBe(2);
    expect(json.status).toBe("ARENA_STATUS_ACTIVE");
    expect(json.defaultDurationSeconds).toBe(120);
    expect(json.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(json.updatedAt).toBe("2026-07-07T00:00:00Z");
  });

  it("converts an archived arena", () => {
    const a = fromJson(ArenaSchema, {
      id: "a2",
      name: "Arhivnaya",
      status: "ARENA_STATUS_ARCHIVED",
    });
    const json = arenaToJson(a) as ArenaJson;
    expect(json.status).toBe("ARENA_STATUS_ARCHIVED");
  });

  it("returns null for undefined", () => {
    expect(arenaToJson(undefined)).toBeNull();
  });

  // Регрессия proto3-omitted: пустые строки и 0 в toJson опускаются —
  // BFF обязан нормализовать дефолты (consumer ждёт строки, не undefined).
  it("normalizes proto3 defaults for empty/seed arena", () => {
    const a = fromJson(ArenaSchema, {
      id: "00000000-0000-0000-0000-000000000aaa",
      tournamentId: "00000000-0000-0000-0000-000000000001",
      createdAt: "2026-07-13T00:00:00Z",
      updatedAt: "2026-07-13T00:00:00Z",
    });

    const json = arenaToJson(a) as ArenaJson;

    expect(json).not.toBeNull();
    expect(json.id).toBe("00000000-0000-0000-0000-000000000aaa");
    expect(json.name).toBe("");
    expect(json.description).toBe("");
    expect(json.position).toBe(0);
    expect(json.status).toBe("ARENA_STATUS_UNSPECIFIED");
    // Спека 0015, FR-8: proto3-omitted default_duration_seconds (0, до
    // миграции/сидирования) нормализуется в дефолт схемы 90с, не 0 (0с —
    // не валидная длительность боя).
    expect(json.defaultDurationSeconds).toBe(90);
  });
});

describe("poolToJson", () => {
  it("normalizes an omitted standings field to an empty array (спека 0016, FR-7)", () => {
    const pool = fromJson(PoolSchema, {
      id: "pool-1",
      nominationId: "n1",
      nominationName: "Longsword",
      number: 1,
      name: "Пул 1",
      members: [],
      status: "POOL_STATUS_READY",
      arenaId: "",
      arenaName: "",
    });

    const json = poolToJson(pool);

    expect(json?.standings).toEqual([]);
  });

  // Спека 0018 (T20): контейнер несёт stage_id — этап, которому принадлежит
  // (круг сетки — тоже "пул" на уровне БД, FR-11a).
  it("passes through stageId (спека 0018)", () => {
    const pool = fromJson(PoolSchema, {
      id: "pool-1",
      nominationId: "n1",
      number: 1,
      name: "1/4 финала, верхняя половина",
      status: "POOL_STATUS_NOT_READY",
      stageId: "stage-bracket-1",
    });

    const json = poolToJson(pool);

    expect(json?.stageId).toBe("stage-bracket-1");
  });

  it("normalizes an omitted stageId to an empty string", () => {
    const pool = fromJson(PoolSchema, { id: "pool-1", nominationId: "n1", name: "Пул 1" });

    const json = poolToJson(pool);

    expect(json?.stageId).toBe("");
  });

  it("returns null for undefined", () => {
    expect(poolToJson(undefined)).toBeNull();
  });
});

describe("stageToJson", () => {
  it("converts a bracket stage with status/bracket config (спека 0018)", () => {
    const stage = fromJson(StageSchema, {
      id: "stage-1",
      nominationId: "n1",
      position: 1,
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      status: "POOL_LAYOUT_STATUS_READY",
      bracket: { size: 8, thirdPlace: true },
    });

    const json = stageToJson(stage);

    expect(json).toEqual({
      id: "stage-1",
      nominationId: "n1",
      position: 1,
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      status: "POOL_LAYOUT_STATUS_READY",
      bracket: { size: 8, thirdPlace: true },
      groups: null,
      rule: null,
    });
  });

  it("normalizes a group stage without bracket config to bracket: null and status default", () => {
    const stage = fromJson(StageSchema, {
      id: "stage-2",
      nominationId: "n1",
      position: 0,
      title: "Групповой этап",
      type: "STAGE_TYPE_GROUPS",
    });

    const json = stageToJson(stage);

    expect(json?.status).toBe("POOL_LAYOUT_STATUS_UNSPECIFIED");
    expect(json?.bracket).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(stageToJson(undefined)).toBeNull();
  });

  // Спека 0019 (T15): groups/rule заполнены только у явно созданного
  // group-этапа со связанным правилом — presence решает «есть/нет», не
  // значения полей.
  it("maps groups/rule when the proto fields are filled (спека 0019)", () => {
    const stage = fromJson(StageSchema, {
      id: "stage-3",
      nominationId: "n1",
      position: 1,
      title: "Группы за 1-8",
      type: "STAGE_TYPE_GROUPS",
      status: "POOL_LAYOUT_STATUS_DRAFT",
      groups: { groupCount: 4 },
      rule: {
        sourceKind: "STAGE_SOURCE_KIND_STAGE",
        sourceStageId: "stage-0",
        selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
        placeFrom: 1,
        placeTo: 2,
        method: "STAGE_LAYOUT_METHOD_SNAKE",
      },
    });

    const json = stageToJson(stage);

    expect(json?.groups).toEqual({ groupCount: 4 });
    expect(json?.rule).toEqual({
      sourceKind: "STAGE_SOURCE_KIND_STAGE",
      sourceStageId: "stage-0",
      selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
      placeFrom: 1,
      placeTo: 2,
      method: "STAGE_LAYOUT_METHOD_SNAKE",
    });
  });

  it("normalizes an open place_to upper bound (0) and roster source (спека 0019)", () => {
    const stage = fromJson(StageSchema, {
      id: "stage-4",
      nominationId: "n1",
      position: 0,
      title: "Группы",
      type: "STAGE_TYPE_GROUPS",
      groups: { groupCount: 2 },
      rule: {
        sourceKind: "STAGE_SOURCE_KIND_ROSTER",
        selector: "STAGE_SELECTOR_KIND_ALL",
        method: "STAGE_LAYOUT_METHOD_SNAKE",
      },
    });

    const json = stageToJson(stage);

    expect(json?.rule).toEqual({
      sourceKind: "STAGE_SOURCE_KIND_ROSTER",
      sourceStageId: "",
      selector: "STAGE_SELECTOR_KIND_ALL",
      placeFrom: 0,
      placeTo: 0,
      method: "STAGE_LAYOUT_METHOD_SNAKE",
    });
  });
});

describe("seedingRuleToJson", () => {
  it("converts a filled protobuf SeedingRule to plain JSON (спека 0019)", () => {
    const rule = fromJson(SeedingRuleSchema, {
      sourceKind: "STAGE_SOURCE_KIND_STAGE",
      sourceStageId: "stage-0",
      selector: "STAGE_SELECTOR_KIND_OVERALL_PLACES",
      placeFrom: 3,
      placeTo: 0,
      method: "STAGE_LAYOUT_METHOD_SEEDED",
    });

    const json = seedingRuleToJson(rule);

    expect(json).toEqual({
      sourceKind: "STAGE_SOURCE_KIND_STAGE",
      sourceStageId: "stage-0",
      selector: "STAGE_SELECTOR_KIND_OVERALL_PLACES",
      placeFrom: 3,
      placeTo: 0,
      method: "STAGE_LAYOUT_METHOD_SEEDED",
    });
  });

  it("returns null for undefined", () => {
    expect(seedingRuleToJson(undefined)).toBeNull();
  });
});

describe("stageBuildPreviewToJson", () => {
  it("converts a filled protobuf StageBuildPreview to plain JSON (entries/ties/unselected/overlaps, спека 0019)", () => {
    const preview = fromJson(StageBuildPreviewSchema, {
      entries: [
        {
          fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
          originLabel: "Группа 1, место 1",
          sourcePlace: 1,
          overallPlace: 1,
          targetPoolNumber: 0,
          targetSlot: 1,
        },
      ],
      unselected: [{ fighterId: "f9", name: "Fighter Nine", club: "" }],
      capacity: 8,
      ties: [
        {
          sourcePoolId: "pool-1",
          groupLabel: "Группа 1",
          place: 2,
          contenders: [
            { fighterId: "f2", name: "Fighter Two", club: "" },
            { fighterId: "f3", name: "Fighter Three", club: "" },
          ],
          slotsLeft: 1,
        },
      ],
      overlaps: [{ fighterId: "f4", name: "Fighter Four", club: "" }],
      sourceUnfinishedBouts: 2,
    });

    const json = stageBuildPreviewToJson(preview);

    expect(json).toEqual({
      entries: [
        {
          fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
          originLabel: "Группа 1, место 1",
          sourcePlace: 1,
          overallPlace: 1,
          targetPoolNumber: 0,
          targetSlot: 1,
        },
      ],
      unselected: [{ fighterId: "f9", name: "Fighter Nine", club: "" }],
      capacity: 8,
      ties: [
        {
          sourcePoolId: "pool-1",
          groupLabel: "Группа 1",
          place: 2,
          contenders: [
            { fighterId: "f2", name: "Fighter Two", club: "" },
            { fighterId: "f3", name: "Fighter Three", club: "" },
          ],
          slotsLeft: 1,
        },
      ],
      overlaps: [{ fighterId: "f4", name: "Fighter Four", club: "" }],
      sourceUnfinishedBouts: 2,
    });
  });

  it("normalizes empty repeated fields to empty arrays", () => {
    const preview = fromJson(StageBuildPreviewSchema, { capacity: 4 });

    const json = stageBuildPreviewToJson(preview);

    expect(json).toEqual({
      entries: [],
      unselected: [],
      capacity: 4,
      ties: [],
      overlaps: [],
      sourceUnfinishedBouts: 0,
    });
  });

  it("returns null for undefined", () => {
    expect(stageBuildPreviewToJson(undefined)).toBeNull();
  });
});

describe("ruleDtoToProto", () => {
  it("maps a DTO SeedingRule to a plain proto-shaped object with numeric enums (спека 0019)", () => {
    const proto = ruleDtoToProto({
      sourceKind: "STAGE_SOURCE_KIND_STAGE",
      sourceStageId: "stage-0",
      selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
      placeFrom: 1,
      placeTo: 2,
      method: "STAGE_LAYOUT_METHOD_SNAKE",
    });

    expect(proto).toEqual({
      sourceKind: 2,
      sourceStageId: "stage-0",
      selector: 2,
      placeFrom: 1,
      placeTo: 2,
      method: 1,
    });
  });

  it("returns undefined for null (снять правило)", () => {
    expect(ruleDtoToProto(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(ruleDtoToProto(undefined)).toBeUndefined();
  });
});

describe("tieResolutionDtoToProto", () => {
  it("maps a DTO TieResolution to a plain proto-shaped object", () => {
    const proto = tieResolutionDtoToProto({
      sourcePoolId: "pool-1",
      place: 2,
      fighterIds: ["f2", "f3"],
    });

    expect(proto).toEqual({ sourcePoolId: "pool-1", place: 2, fighterIds: ["f2", "f3"] });
  });
});

describe("bracketToJson", () => {
  it("converts a filled protobuf Bracket to plain JSON (rounds → halves → pairs → slots)", () => {
    const bracket = fromJson(BracketSchema, {
      stage: {
        id: "stage-1",
        nominationId: "n1",
        position: 1,
        title: "Плейофф",
        type: "STAGE_TYPE_BRACKET",
        status: "POOL_LAYOUT_STATUS_READY",
        bracket: { size: 4, thirdPlace: true },
      },
      rounds: [
        {
          number: 1,
          title: "1/2 финала",
          thirdPlace: false,
          halves: [
            {
              half: 1,
              title: "1/2 финала, верхняя половина",
              container: {
                id: "pool-1",
                nominationId: "n1",
                number: 1,
                name: "1/2 финала, верхняя половина",
                status: "POOL_STATUS_ACTIVE",
                stageId: "stage-1",
              },
              pairs: [
                {
                  index: 1,
                  slotA: {
                    slot: 1,
                    state: "BRACKET_SLOT_STATE_FILLED",
                    fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
                    sourceLabel: "",
                  },
                  slotB: {
                    slot: 2,
                    state: "BRACKET_SLOT_STATE_FILLED",
                    fighter: { fighterId: "f2", name: "Fighter Two", club: "Berkut" },
                    sourceLabel: "",
                  },
                  bout: {
                    id: "bout-1",
                    roundNumber: 1,
                    sequenceNumber: 1,
                    fighterA: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
                    fighterB: { fighterId: "f2", name: "Fighter Two", club: "Berkut" },
                    state: "BOUT_STATE_IN_PROGRESS",
                    scoreA: 3,
                    scoreB: 2,
                  },
                  resolved: false,
                },
              ],
              currentBoutId: "bout-1",
            },
          ],
        },
        {
          number: 2,
          title: "Финал",
          thirdPlace: false,
          halves: [
            {
              half: 1,
              title: "",
              container: {
                id: "pool-2",
                nominationId: "n1",
                number: 1,
                name: "Финал",
                status: "POOL_STATUS_NOT_READY",
                stageId: "stage-1",
              },
              pairs: [
                {
                  index: 1,
                  slotA: {
                    slot: 1,
                    state: "BRACKET_SLOT_STATE_PENDING",
                    sourceLabel: "Победитель пары 1, 1/2 финала",
                  },
                  slotB: {
                    slot: 2,
                    state: "BRACKET_SLOT_STATE_PENDING",
                    sourceLabel: "Победитель пары 2, 1/2 финала",
                  },
                  resolved: false,
                },
              ],
              currentBoutId: "",
            },
          ],
        },
      ],
      unassigned: [{ fighterId: "f5", name: "Fighter Five", club: "" }],
      canUndo: true,
    });

    const json = bracketToJson(bracket);

    expect(json).not.toBeNull();
    expect(json?.stage.id).toBe("stage-1");
    expect(json?.stage.bracket).toEqual({ size: 4, thirdPlace: true });
    expect(json?.rounds).toHaveLength(2);
    expect(json?.rounds[0].halves).toHaveLength(1);

    const firstPair = json!.rounds[0].halves[0].pairs[0];
    expect(firstPair.slotA.fighter.name).toBe("Fighter One");
    expect(firstPair.bout?.state).toBe("BOUT_STATE_IN_PROGRESS");
    expect(firstPair.resolved).toBe(false);

    const finalPair = json!.rounds[1].halves[0].pairs[0];
    expect(finalPair.slotA.state).toBe("BRACKET_SLOT_STATE_PENDING");
    expect(finalPair.slotA.sourceLabel).toBe("Победитель пары 1, 1/2 финала");
    // pending slot has no fighter yet — normalized to empty FighterRef, not undefined
    expect(finalPair.slotA.fighter).toEqual({ fighterId: "", name: "", club: "" });
    expect(finalPair.bout).toBeNull();

    expect(json?.unassigned).toEqual([{ fighterId: "f5", name: "Fighter Five", club: "" }]);
    expect(json?.canUndo).toBe(true);
    expect(json?.champion).toBeNull();
    expect(json?.thirdPlaceWinner).toBeNull();
  });

  it("normalizes champion/thirdPlaceWinner when the final/bronze bout is finished", () => {
    const bracket = fromJson(BracketSchema, {
      stage: {
        id: "stage-1",
        nominationId: "n1",
        position: 1,
        title: "Плейофф",
        type: "STAGE_TYPE_BRACKET",
      },
      champion: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
      thirdPlaceWinner: { fighterId: "f3", name: "Fighter Three", club: "" },
    });

    const json = bracketToJson(bracket);

    expect(json?.champion).toEqual({ fighterId: "f1", name: "Fighter One", club: "Sokol" });
    expect(json?.thirdPlaceWinner).toEqual({ fighterId: "f3", name: "Fighter Three", club: "" });
  });

  it("returns null for undefined", () => {
    expect(bracketToJson(undefined)).toBeNull();
  });
});

describe("poolLayoutToJson", () => {
  // Спека 0017 (FR-2, T12): PoolLayout несёт этап, которому принадлежит
  // раскладка — stageToJson пробрасывает его 1:1 в JSON.
  it("passes through the stage field (спека 0017)", () => {
    const layout = fromJson(PoolLayoutSchema, {
      nominationId: "n1",
      status: "POOL_LAYOUT_STATUS_DRAFT",
      unassigned: [],
      pools: [],
      canUndo: false,
      stage: {
        id: "stage-1",
        nominationId: "n1",
        position: 0,
        title: "Групповой этап",
        type: "STAGE_TYPE_GROUPS",
      },
    });

    const json = poolLayoutToJson(layout);

    expect(json?.stage).toEqual({
      id: "stage-1",
      nominationId: "n1",
      position: 0,
      title: "Групповой этап",
      type: "STAGE_TYPE_GROUPS",
      status: "POOL_LAYOUT_STATUS_UNSPECIFIED",
      bracket: null,
      groups: null,
      rule: null,
    });
  });

  it("returns null for undefined", () => {
    expect(poolLayoutToJson(undefined)).toBeNull();
  });
});

describe("arenasToJson", () => {
  it("converts an array of protobuf Arenas", () => {
    const a = fromJson(ArenaSchema, { id: "a1", name: "A", status: "ARENA_STATUS_ACTIVE" });
    const b = fromJson(ArenaSchema, { id: "a2", name: "B", status: "ARENA_STATUS_ARCHIVED" });

    const json = arenasToJson([a, b]);

    expect(json).toHaveLength(2);
    expect(json[0].id).toBe("a1");
    expect(json[0].status).toBe("ARENA_STATUS_ACTIVE");
    expect(json[1].status).toBe("ARENA_STATUS_ARCHIVED");
  });

  it("returns empty array for undefined", () => {
    expect(arenasToJson(undefined)).toEqual([]);
  });
});

describe("nominationResultsToJson", () => {
  it("converts a filled protobuf NominationResults to plain JSON, with range places and diapason splits (AC-6/AC-7)", () => {
    const results = fromJson(NominationResultsSchema, {
      nominationId: "nom-1",
      nominationFinished: true,
      sections: [
        {
          stageId: "stage-1",
          stageTitle: "Плейофф",
          stageType: "STAGE_TYPE_BRACKET",
          finished: true,
          entries: [
            {
              placeFrom: 1,
              placeTo: 1,
              fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
              originLabel: "Чемпион",
            },
            {
              placeFrom: 3,
              placeTo: 4,
              fighter: { fighterId: "f3", name: "Fighter Three", club: "" },
              originLabel: "выбыл в 1/2 финала",
            },
          ],
          placesFromOverallOrder: false,
        },
        {
          stageId: "stage-0",
          stageTitle: "Групповой этап",
          stageType: "STAGE_TYPE_GROUPS",
          finished: false,
          entries: [],
          placesFromOverallOrder: false,
        },
      ],
    });

    const json = nominationResultsToJson(results);

    expect(json).toEqual({
      nominationId: "nom-1",
      nominationFinished: true,
      sections: [
        {
          stageId: "stage-1",
          stageTitle: "Плейофф",
          stageType: "STAGE_TYPE_BRACKET",
          finished: true,
          entries: [
            {
              placeFrom: 1,
              placeTo: 1,
              fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
              originLabel: "Чемпион",
            },
            {
              placeFrom: 3,
              placeTo: 4,
              fighter: { fighterId: "f3", name: "Fighter Three", club: "" },
              originLabel: "выбыл в 1/2 финала",
            },
          ],
          placesFromOverallOrder: false,
        },
        {
          stageId: "stage-0",
          stageTitle: "Групповой этап",
          stageType: "STAGE_TYPE_GROUPS",
          finished: false,
          entries: [],
          placesFromOverallOrder: false,
        },
      ],
    });
  });

  it("returns null for undefined", () => {
    expect(nominationResultsToJson(undefined)).toBeNull();
  });

  it("normalizes an empty results message to an unfinished nomination with no sections", () => {
    const results = fromJson(NominationResultsSchema, { nominationId: "nom-2" });
    expect(nominationResultsToJson(results)).toEqual({
      nominationId: "nom-2",
      nominationFinished: false,
      sections: [],
    });
  });
});

describe("nominationLiveToJson", () => {
  it("converts a filled protobuf NominationLiveSnapshot to plain JSON (nested Pool/BoardBout)", () => {
    const snapshot = fromJson(NominationLiveSnapshotSchema, {
      nominationId: "nom-1",
      pools: [
        {
          pool: {
            id: "pool-1",
            nominationId: "nom-1",
            nominationName: "Longsword",
            number: 1,
            name: "Пул 1",
            members: [{ fighterId: "f1", name: "Fighter One", club: "Sokol" }],
            status: "POOL_STATUS_ACTIVE",
            arenaId: "arena-1",
            arenaName: "Ристалище 1",
            standings: [
              {
                fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
                wins: 1,
                draws: 0,
                losses: 0,
                pointsScored: 5,
                pointsConceded: 3,
                place: 1,
              },
            ],
          },
          bouts: [
            {
              id: "bout-1",
              roundNumber: 1,
              sequenceNumber: 1,
              fighterA: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
              fighterB: { fighterId: "f2", name: "Fighter Two", club: "Berkut" },
              state: "BOUT_STATE_FINISHED",
              scoreA: 5,
              scoreB: 3,
            },
            {
              id: "bout-2",
              roundNumber: 1,
              sequenceNumber: 2,
              fighterA: { fighterId: "f3", name: "Fighter Three", club: "" },
              fighterB: { fighterId: "f4", name: "Fighter Four", club: "" },
              state: "BOUT_STATE_IN_PROGRESS",
              scoreA: 1,
              scoreB: 0,
            },
          ],
          currentBoutId: "bout-2",
        },
      ],
      // Спека 0017 (FR-2, T12): этапы номинации — stagesToJson пробрасывает
      // их 1:1 в JSON рядом с pools.
      stages: [
        {
          id: "stage-1",
          nominationId: "nom-1",
          position: 0,
          title: "Групповой этап",
          type: "STAGE_TYPE_GROUPS",
        },
      ],
      // Спека 0018 (T20): плейофф-сетки номинации — bracketToJson на
      // proto-подсообщениях snapshot.brackets, рядом с pools/stages.
      brackets: [
        {
          stage: {
            id: "stage-2",
            nominationId: "nom-1",
            position: 1,
            title: "Плейофф",
            type: "STAGE_TYPE_BRACKET",
            status: "POOL_LAYOUT_STATUS_READY",
            bracket: { size: 4, thirdPlace: false },
          },
          rounds: [],
          unassigned: [],
          canUndo: false,
        },
      ],
      // Спека 0021 (T12): итоговый протокол — results едет тем же живым
      // каналом, что pools/stages/brackets (FR-18).
      results: {
        nominationId: "nom-1",
        nominationFinished: true,
        sections: [
          {
            stageId: "stage-2",
            stageTitle: "Плейофф",
            stageType: "STAGE_TYPE_BRACKET",
            finished: true,
            entries: [
              {
                placeFrom: 1,
                placeTo: 1,
                fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
                originLabel: "Чемпион",
              },
            ],
            placesFromOverallOrder: false,
          },
        ],
      },
    });

    const json = nominationLiveToJson(snapshot);

    expect(json).not.toBeNull();
    expect(json?.nominationId).toBe("nom-1");
    expect(json?.pools).toHaveLength(1);
    expect(json?.stages).toEqual([
      {
        id: "stage-1",
        nominationId: "nom-1",
        position: 0,
        title: "Групповой этап",
        type: "STAGE_TYPE_GROUPS",
        status: "POOL_LAYOUT_STATUS_UNSPECIFIED",
        bracket: null,
        groups: null,
        rule: null,
      },
    ]);
    expect(json?.brackets).toHaveLength(1);
    expect(json?.brackets[0].stage.id).toBe("stage-2");
    expect(json?.brackets[0].stage.bracket).toEqual({ size: 4, thirdPlace: false });
    expect(json?.results).toEqual({
      nominationId: "nom-1",
      nominationFinished: true,
      sections: [
        {
          stageId: "stage-2",
          stageTitle: "Плейофф",
          stageType: "STAGE_TYPE_BRACKET",
          finished: true,
          entries: [
            {
              placeFrom: 1,
              placeTo: 1,
              fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
              originLabel: "Чемпион",
            },
          ],
          placesFromOverallOrder: false,
        },
      ],
    });

    const lp = json!.pools[0];
    expect(lp.pool.id).toBe("pool-1");
    expect(lp.pool.status).toBe("POOL_STATUS_ACTIVE");
    expect(lp.pool.arenaName).toBe("Ристалище 1");
    expect(lp.pool.members).toEqual([{ fighterId: "f1", name: "Fighter One", club: "Sokol" }]);
    expect(lp.currentBoutId).toBe("bout-2");
    expect(lp.bouts).toHaveLength(2);
    expect(lp.bouts[0].state).toBe("BOUT_STATE_FINISHED");
    expect(lp.bouts[0].scoreA).toBe(5);
    expect(lp.bouts[0].scoreB).toBe(3);
    expect(lp.bouts[1].state).toBe("BOUT_STATE_IN_PROGRESS");
    expect(lp.bouts[1].fighterA.name).toBe("Fighter Three");
    // proto3-omitted defaults normalized (empty club, not undefined)
    expect(lp.bouts[1].fighterA.club).toBe("");
    // спека 0016: итоговая таблица пула проброшена в JSON без пересортировки
    expect(lp.pool.standings).toEqual([
      {
        fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
        wins: 1,
        draws: 0,
        losses: 0,
        pointsScored: 5,
        pointsConceded: 3,
        place: 1,
      },
    ]);
  });

  it("returns null for undefined", () => {
    expect(nominationLiveToJson(undefined)).toBeNull();
  });

  it("normalizes an empty snapshot (draft raskladka, FR-12) to an empty pools array", () => {
    const snapshot = fromJson(NominationLiveSnapshotSchema, { nominationId: "nom-2" });

    const json = nominationLiveToJson(snapshot);

    expect(json).toEqual({
      nominationId: "nom-2",
      pools: [],
      stages: [],
      brackets: [],
      results: { nominationId: "nom-2", nominationFinished: false, sections: [] },
    });
  });
});

describe("arenaLiveToJson", () => {
  it("converts a filled protobuf ArenaLiveSnapshot to plain JSON (board via boutBoardToJson, int64 as string)", () => {
    const snapshot = fromJson(ArenaLiveSnapshotSchema, {
      board: {
        pool: {
          id: "pool-1",
          nominationId: "n1",
          nominationName: "Longsword",
          number: 1,
          name: "Пул 1",
          members: [],
          status: "POOL_STATUS_ACTIVE",
          arenaId: "arena-1",
          arenaName: "Ристалище 1",
        },
        bouts: [
          {
            id: "bout-1",
            roundNumber: 1,
            sequenceNumber: 1,
            fighterA: { fighterId: "f1", name: "Fighter One", club: "" },
            fighterB: { fighterId: "f2", name: "Fighter Two", club: "" },
            state: "BOUT_STATE_IN_PROGRESS",
            scoreA: 3,
            scoreB: 2,
          },
        ],
        currentBoutId: "bout-1",
      },
      timer: {
        status: "TIMER_STATUS_RUNNING",
        remainingCs: 1247,
        sampledUnixMs: "1234567890123",
        defaultCs: 9000,
      },
      room: {
        scoreboardCount: 2,
        thisOrdinal: 1,
        thisIsSource: true,
        sidesSwapped: false,
        revealGeneration: 3,
      },
      defaultDurationSeconds: 90,
      serverNowUnixMs: "1234567890999",
    });

    const json = arenaLiveToJson(snapshot);

    expect(json).not.toBeNull();
    expect(json?.board?.pool?.id).toBe("pool-1");
    expect(json?.board?.currentBoutId).toBe("bout-1");
    expect(json?.timer).toEqual({
      status: "TIMER_STATUS_RUNNING",
      remainingCs: 1247,
      sampledUnixMs: "1234567890123",
      defaultCs: 9000,
    });
    expect(json?.room).toEqual({
      scoreboardCount: 2,
      thisOrdinal: 1,
      thisIsSource: true,
      sidesSwapped: false,
      revealGeneration: 3,
    });
    expect(json?.defaultDurationSeconds).toBe(90);
    // int64 → string (не bigint, не number — round-trip regression).
    expect(typeof json?.serverNowUnixMs).toBe("string");
    expect(json?.serverNowUnixMs).toBe("1234567890999");
  });

  it("returns null for undefined", () => {
    expect(arenaLiveToJson(undefined)).toBeNull();
  });

  it("normalizes an empty snapshot (no pool seated, FR-5) — board null, timer/room/default fall back", () => {
    const snapshot = fromJson(ArenaLiveSnapshotSchema, {});

    const json = arenaLiveToJson(snapshot);

    expect(json?.board).toBeNull();
    expect(json?.timer).toEqual({
      status: "TIMER_STATUS_STOPPED",
      remainingCs: 9000,
      sampledUnixMs: "0",
      defaultCs: 9000,
    });
    expect(json?.room).toEqual({
      scoreboardCount: 0,
      thisOrdinal: 0,
      thisIsSource: false,
      sidesSwapped: false,
      revealGeneration: 0,
    });
    expect(json?.defaultDurationSeconds).toBe(90);
    expect(json?.serverNowUnixMs).toBe("0");
  });
});

describe("schemaIssueToJson / schemaIssuesToJson", () => {
  it("converts a filled protobuf SchemaIssue to plain JSON (спека 0020, FR-8)", () => {
    const issue = fromJson(SchemaIssueSchema, {
      severity: "SCHEMA_ISSUE_SEVERITY_WARNING",
      code: "SCHEMA_ISSUE_CODE_COVERAGE_GAP",
      stageIds: ["stage-1", "stage-2"],
      message: "Между ветками есть разрыв покрытия.",
    });

    const json = schemaIssueToJson(issue);

    expect(json).toEqual({
      severity: "SCHEMA_ISSUE_SEVERITY_WARNING",
      code: "SCHEMA_ISSUE_CODE_COVERAGE_GAP",
      stageIds: ["stage-1", "stage-2"],
      message: "Между ветками есть разрыв покрытия.",
    });
  });

  it("normalizes an issue with no stage_ids to an empty array and default severity/code", () => {
    const issue = fromJson(SchemaIssueSchema, {
      message: "",
    });

    const json = schemaIssueToJson(issue);

    expect(json).toEqual({
      severity: "SCHEMA_ISSUE_SEVERITY_UNSPECIFIED",
      code: "SCHEMA_ISSUE_CODE_UNSPECIFIED",
      stageIds: [],
      message: "",
    });
  });

  it("returns null for undefined", () => {
    expect(schemaIssueToJson(undefined)).toBeNull();
  });

  it("converts an array of issues, preserving order", () => {
    const issues = [
      fromJson(SchemaIssueSchema, {
        severity: "SCHEMA_ISSUE_SEVERITY_ERROR",
        code: "SCHEMA_ISSUE_CODE_NO_GROUP_COUNT",
        stageIds: ["stage-1"],
        message: "Правилу нужно число групп.",
      }),
      fromJson(SchemaIssueSchema, {
        severity: "SCHEMA_ISSUE_SEVERITY_INFO",
        code: "SCHEMA_ISSUE_CODE_TAIL_UNCOVERED",
        stageIds: ["stage-2"],
        message: "Хвост состава источника никуда не идёт.",
      }),
    ];

    const json = schemaIssuesToJson(issues);

    expect(json).toHaveLength(2);
    expect(json[0].code).toBe("SCHEMA_ISSUE_CODE_NO_GROUP_COUNT");
    expect(json[1].code).toBe("SCHEMA_ISSUE_CODE_TAIL_UNCOVERED");
  });

  it("returns an empty array for undefined", () => {
    expect(schemaIssuesToJson(undefined)).toEqual([]);
  });
});

describe("formatStageSpecToJson", () => {
  it("converts a bracket-typed spec with a stage source, filling groups with zero value (спека 0020, FR-11)", () => {
    const spec = fromJson(FormatStageSpecSchema, {
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      bracket: { size: 8, thirdPlace: true },
      sourceKind: "STAGE_SOURCE_KIND_STAGE",
      sourceIndex: 0,
      selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
      placeFrom: 1,
      placeTo: 2,
      method: "STAGE_LAYOUT_METHOD_SNAKE",
    });

    const json = formatStageSpecToJson(spec);

    expect(json).toEqual({
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      bracket: { size: 8, thirdPlace: true },
      groups: { groupCount: 0 },
      sourceKind: "STAGE_SOURCE_KIND_STAGE",
      sourceIndex: 0,
      selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
      placeFrom: 1,
      placeTo: 2,
      method: "STAGE_LAYOUT_METHOD_SNAKE",
    });
  });

  it("converts a groups-typed spec with no source, filling bracket with zero value", () => {
    const spec = fromJson(FormatStageSpecSchema, {
      title: "Группы",
      type: "STAGE_TYPE_GROUPS",
      groups: { groupCount: 4 },
      sourceKind: "STAGE_SOURCE_KIND_ROSTER",
      selector: "STAGE_SELECTOR_KIND_ALL",
      method: "STAGE_LAYOUT_METHOD_SNAKE",
    });

    const json = formatStageSpecToJson(spec);

    expect(json?.bracket).toEqual({ size: 0, thirdPlace: false });
    expect(json?.groups).toEqual({ groupCount: 4 });
    expect(json?.sourceIndex).toBe(0);
  });

  it("returns null for undefined", () => {
    expect(formatStageSpecToJson(undefined)).toBeNull();
  });
});

describe("formatPresetToJson / formatPresetsToJson", () => {
  it("converts a filled protobuf FormatPreset to plain JSON, incl. ISO timestamps (спека 0020, FR-11/FR-12)", () => {
    const preset = fromJson(FormatPresetSchema, {
      id: "preset-1",
      name: "Группы (2) → двойной плейофф",
      stages: [
        {
          title: "Группы",
          type: "STAGE_TYPE_GROUPS",
          groups: { groupCount: 2 },
          sourceKind: "STAGE_SOURCE_KIND_ROSTER",
          selector: "STAGE_SELECTOR_KIND_ALL",
          method: "STAGE_LAYOUT_METHOD_SNAKE",
        },
        {
          title: "Плейофф",
          type: "STAGE_TYPE_BRACKET",
          bracket: { size: 8, thirdPlace: false },
          sourceKind: "STAGE_SOURCE_KIND_STAGE",
          sourceIndex: 0,
          selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
          placeFrom: 1,
          placeTo: 2,
          method: "STAGE_LAYOUT_METHOD_SEEDED",
        },
      ],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-07-07T00:00:00Z",
    });

    const json = formatPresetToJson(preset);

    expect(json?.id).toBe("preset-1");
    expect(json?.name).toBe("Группы (2) → двойной плейофф");
    expect(json?.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(json?.updatedAt).toBe("2026-07-07T00:00:00Z");
    expect(json?.stages).toHaveLength(2);
    expect(json?.stages[0]).toEqual({
      title: "Группы",
      type: "STAGE_TYPE_GROUPS",
      bracket: { size: 0, thirdPlace: false },
      groups: { groupCount: 2 },
      sourceKind: "STAGE_SOURCE_KIND_ROSTER",
      sourceIndex: 0,
      selector: "STAGE_SELECTOR_KIND_ALL",
      placeFrom: 0,
      placeTo: 0,
      method: "STAGE_LAYOUT_METHOD_SNAKE",
    });
    expect(json?.stages[1]).toEqual({
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      bracket: { size: 8, thirdPlace: false },
      groups: { groupCount: 0 },
      sourceKind: "STAGE_SOURCE_KIND_STAGE",
      sourceIndex: 0,
      selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
      placeFrom: 1,
      placeTo: 2,
      method: "STAGE_LAYOUT_METHOD_SEEDED",
    });
  });

  it("normalizes an empty stages list", () => {
    const preset = fromJson(FormatPresetSchema, {
      id: "preset-2",
      name: "Пустой",
    });

    const json = formatPresetToJson(preset);

    expect(json?.stages).toEqual([]);
    expect(json?.createdAt).toBe("");
    expect(json?.updatedAt).toBe("");
  });

  it("returns null for undefined", () => {
    expect(formatPresetToJson(undefined)).toBeNull();
  });

  it("converts an array of presets, preserving order", () => {
    const presets = [
      fromJson(FormatPresetSchema, { id: "p1", name: "A" }),
      fromJson(FormatPresetSchema, { id: "p2", name: "B" }),
    ];

    const json = formatPresetsToJson(presets);

    expect(json).toHaveLength(2);
    expect(json.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("returns an empty array for undefined", () => {
    expect(formatPresetsToJson(undefined)).toEqual([]);
  });
});
