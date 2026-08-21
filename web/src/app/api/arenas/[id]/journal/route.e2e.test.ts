import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

import {
  StageAdminService,
  StagePublicService,
  GetArenaJournalResponseSchema,
  BoutJournalEntrySchema,
  BoutEventKind,
  type BoutJournalEntry,
} from "@/gen/hema/v1/stage_pb";

// E2E-тест BFF route.ts: реальный journalEntriesToJson + реальная proto
// binary-сериализация через createRouterTransport (in-process, ADR 0010).
// Ловит proto3-omitted (club/actorDisplayName пусты) и round-trip Timestamp
// (occurredAt → ISO), которые мок-транспорт route.test.ts не проверяет.

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/grpc/client", async () => {
  return {
    stageAdminClient: createClient(
      StageAdminService,
      createRouterTransport((router) => {
        router.service(StageAdminService, {
          getArenaJournal: async () => create(GetArenaJournalResponseSchema, { entries: mockEntries }),
        });
      }),
    ),
    // StagePublicService не используется этим route, но лежит в том же
    // gen-модуле — по образцу routes.e2e.test.ts не подключаем лишнего.
    stagePublicClient: createClient(StagePublicService, createRouterTransport(() => {})),
  };
});

import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

let mockEntries: BoutJournalEntry[] = [];

function getReq() {
  return new NextRequest("http://localhost/api/arenas/a1/journal");
}

describe("app/api/arenas/[id]/journal route (e2e — real proto serialize)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    mockEntries = [];
  });

  it("returns an empty array when the arena has no seated pool (AC-20)", async () => {
    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ entries: [] });
  });

  it("normalizes proto3-omitted club/actorDisplayName to empty strings", async () => {
    mockEntries = [
      create(BoutJournalEntrySchema, {
        boutId: "b1",
        sequenceNumber: 7,
        fighterA: { fighterId: "f1", name: "Ильин" },
        fighterB: { fighterId: "f2", name: "Дерюгин" },
        kind: BoutEventKind.STARTED,
        occurredAt: timestampFromDate(new Date("2026-08-15T14:12:40Z")),
      }),
    ];

    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    const data = await res.json();

    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].fighterA).toEqual({ fighterId: "f1", name: "Ильин", club: "" });
    expect(data.entries[0].actorDisplayName).toBe("");
    expect(data.entries[0].scoreA).toBe(0);
    expect(data.entries[0].scoreB).toBe(0);
    expect(data.entries[0].kind).toBe("BOUT_EVENT_KIND_STARTED");
    // Timestamp → ISO-строка после toJson.
    expect(data.entries[0].occurredAt).toContain("2026-08-15T14:12:40");
  });

  it("round-trips a full FINISHED entry with actor and score", async () => {
    mockEntries = [
      create(BoutJournalEntrySchema, {
        boutId: "b2",
        sequenceNumber: 6,
        fighterA: { fighterId: "f1", name: "Ильин", club: "Северный клинок" },
        fighterB: { fighterId: "f2", name: "Дерюгин", club: "Гарда" },
        kind: BoutEventKind.FINISHED,
        scoreA: 2,
        scoreB: 5,
        occurredAt: timestampFromDate(new Date("2026-08-15T14:11:58Z")),
        actorDisplayName: "Тихонов",
      }),
    ];

    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    const data = await res.json();

    expect(data.entries[0].kind).toBe("BOUT_EVENT_KIND_FINISHED");
    expect(data.entries[0].scoreA).toBe(2);
    expect(data.entries[0].scoreB).toBe(5);
    expect(data.entries[0].actorDisplayName).toBe("Тихонов");
    expect(data.entries[0].fighterA.club).toBe("Северный клинок");
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
  });
});
