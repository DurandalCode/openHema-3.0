import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectError, Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

import {
  FighterAdminService,
  FighterSchema,
  FighterStatus,
  ListRosterResponseSchema,
  ParticipationSchema,
  ParticipationStatus,
  WithdrawalReason,
  type Fighter,
  type ListRosterRequest,
} from "@/gen/hema/v1/fighter_pb";
import { NominationSchema, NominationService, ListNominationsResponseSchema } from "@/gen/hema/v1/nomination_pb";

// E2E-тест BFF route.ts: реальный fightersToJson/nominationsToJson + реальная
// proto binary-сериализация через createRouterTransport (in-process), реальный
// toCsv (shared/lib/csv.ts) — НЕ мокаем ни то, ни другое (ADR 0010). Первый
// файл-скачивающий роут проекта (план 0041 «Риски») — здесь же проверяем
// Content-Type/Content-Disposition.

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));

let currentMockFighters: Fighter[] = [];
let currentMockError: ConnectError | null = null;
let lastListRosterRequest: ListRosterRequest | null = null;

vi.mock("@/lib/grpc/client", async () => {
  return {
    fighterAdminClient: createClient(
      FighterAdminService,
      createRouterTransport((router) => {
        router.service(FighterAdminService, {
          listRoster: async (req) => {
            lastListRosterRequest = req;
            if (currentMockError) throw currentMockError;
            return create(ListRosterResponseSchema, {
              fighters: currentMockFighters,
              totalCount: currentMockFighters.length,
              statusCounts: [],
            });
          },
        });
      }),
    ),
    nominationClient: createClient(
      NominationService,
      createRouterTransport((router) => {
        router.service(NominationService, {
          listNominations: async () => {
            return create(ListNominationsResponseSchema, {
              nominations: [
                create(NominationSchema, { id: "n1", tournamentId: "t1", title: "Лонгсворд", position: 0 }),
                create(NominationSchema, { id: "n2", tournamentId: "t1", title: "Сабля", position: 1 }),
              ],
            });
          },
        });
      }),
    ),
  };
});

import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function makeFighter(overrides: Partial<Omit<Fighter, "$typeName" | "$unknown">> & { id: string }): Fighter {
  return create(FighterSchema, {
    tournamentId: "t1",
    name: "Иван Петров",
    club: "Клинок Севера",
    status: FighterStatus.ACTIVE,
    withdrawalReason: WithdrawalReason.UNSPECIFIED,
    participations: [],
    createdAt: timestampFromDate(new Date("2026-01-01T00:00:00Z")),
    updatedAt: timestampFromDate(new Date("2026-01-01T00:00:00Z")),
    ...overrides,
  });
}

function req(query = "?tournamentId=t1"): NextRequest {
  return new NextRequest(`http://localhost/api/admin/fighters/export${query}`);
}

describe("GET /api/admin/fighters/export (e2e — real proto serialize + real CSV)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    currentMockFighters = [];
    currentMockError = null;
    lastListRosterRequest = null;
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 400 on an unknown status label", async () => {
    const res = await GET(req("?statuses=NOT_A_STATUS"));
    expect(res.status).toBe(400);
  });

  it("returns a CSV file with the right headers, a leading UTF-8 BOM, and a header-only body for an empty roster (AC-8 shape)", async () => {
    currentMockFighters = [];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="roster.csv"');
    // Response.text() (TextDecoder) сам съедает BOM при декодировании — BOM
    // проверяем по сырым байтам (EF BB BF), а не через .text() (FR-15).
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8").decode(bytes);
    expect(text).toBe("Имя,Клуб,Статус,Причина,Номинации\r\n");
  });

  it("exports one row per fighter: name/club/status/reason and active nominations joined by '; ' (spec 0041, FR-11/AC-8)", async () => {
    currentMockFighters = [
      makeFighter({
        id: "f1",
        name: "Иван Петров",
        club: "Клинок Севера",
        status: FighterStatus.ACTIVE,
        participations: [
          create(ParticipationSchema, { nominationId: "n1", status: ParticipationStatus.ACTIVE }),
          create(ParticipationSchema, { nominationId: "n2", status: ParticipationStatus.REMOVED }),
        ],
      }),
      makeFighter({
        id: "f2",
        // Запятая заставляет обернуть значение в кавычки; кавычка внутри
        // значения удваивается (RFC 4180, FR-15).
        name: 'Анна, "Сталь"',
        club: "",
        status: FighterStatus.WITHDRAWN,
        withdrawalReason: WithdrawalReason.INJURY,
        participations: [],
      }),
    ];

    const res = await GET(req());
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("Имя,Клуб,Статус,Причина,Номинации");
    // Только АКТИВНОЕ участие (n1) попадает в список — снятое (n2) нет.
    expect(lines[1]).toBe("Иван Петров,Клинок Севера,Активен,,Лонгсворд");
    expect(lines[2]).toBe('"Анна, ""Сталь""",,Выбыл,травма,');
  });

  it("forwards the filter (statuses/clubs/includeNoClub/search) and requests a single call with a large limit, no page/pageSize (spec 0041, FR-14/план «Экспорт CSV»)", async () => {
    currentMockFighters = [makeFighter({ id: "f1" })];
    const res = await GET(
      req(
        "?tournamentId=t1&statuses=FIGHTER_STATUS_ACTIVE&clubs=%D0%9A%D0%BB%D1%83%D0%B1&includeNoClub=1&search=%D0%B8%D0%B2%D0%B0%D0%BD",
      ),
    );
    expect(res.status).toBe(200);
    expect(lastListRosterRequest).not.toBeNull();
    expect(lastListRosterRequest?.tournamentId).toBe("t1");
    expect(lastListRosterRequest?.statuses).toEqual([FighterStatus.ACTIVE]);
    expect(lastListRosterRequest?.clubs).toEqual(["Клуб"]);
    expect(lastListRosterRequest?.includeNoClub).toBe(true);
    expect(lastListRosterRequest?.search).toBe("иван");
    expect(lastListRosterRequest?.offset).toBe(0);
    expect(lastListRosterRequest?.limit).toBeGreaterThanOrEqual(10_000);
  });

  it("maps a ConnectError from ListRoster to the mapped HTTP status", async () => {
    currentMockError = new ConnectError("not found", Code.NotFound);
    const res = await GET(req());
    expect(res.status).toBe(404);
  });
});
