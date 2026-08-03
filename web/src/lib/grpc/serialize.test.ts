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
import {
  NominationLiveSnapshotSchema,
  ArenaLiveSnapshotSchema,
  PoolSchema,
  PoolLayoutSchema,
} from "@/gen/hema/v1/stage_pb";
import {
  applicationHistoryToJson,
  applicationsToJson,
  applicationToJson,
  arenaToJson,
  arenasToJson,
  arenaLiveToJson,
  nominationParticipantsToJson,
  nominationsToJson,
  nominationToJson,
  nominationLiveToJson,
  poolLayoutToJson,
  poolToJson,
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
    });

    const json = applicationHistoryToJson([ev]);

    expect(json).toHaveLength(1);
    expect(json[0].type).toBe("APPLICATION_EVENT_TYPE_SUBMITTED");
    expect(json[0].actorId).toBe("user-1");
    expect(json[0].sequence).toBe(1);
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

  it("returns null for undefined", () => {
    expect(poolToJson(undefined)).toBeNull();
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
      },
    ]);

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

    expect(json).toEqual({ nominationId: "nom-2", pools: [], stages: [] });
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
