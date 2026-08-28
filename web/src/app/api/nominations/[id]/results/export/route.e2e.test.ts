import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectError, Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { create, type MessageInitShape } from "@bufbuild/protobuf";

import {
  StagePublicService,
  GetNominationResultsResponseSchema,
  NominationResultsSchema,
  StageType,
} from "@/gen/hema/v1/stage_pb";

// E2E-тест BFF route.ts: реальная CSV-сериализация поверх реального
// nominationResultsToJson и реальной proto binary-сериализации через
// createRouterTransport (in-process) — как остальные e2e BFF-тесты (ADR
// 0010). НЕ мокаем serialize/csv вручную.

let currentMockResults: MessageInitShape<typeof NominationResultsSchema> | undefined;
let currentMockError: ConnectError | null = null;

vi.mock("@/lib/grpc/client", async () => {
  return {
    stagePublicClient: createClient(
      StagePublicService,
      createRouterTransport((router) => {
        router.service(StagePublicService, {
          getNominationResults: async () => {
            if (currentMockError) throw currentMockError;
            return create(GetNominationResultsResponseSchema, { results: currentMockResults });
          },
        });
      }),
    ),
  };
});

import { GET } from "./route";

function req() {
  return new NextRequest("http://localhost/api/nominations/n1/results/export");
}

function ctx() {
  return { params: Promise.resolve({ id: "n1" }) };
}

describe("app/api/nominations/[id]/results/export route (e2e — real proto + CSV)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockResults = undefined;
    currentMockError = null;
  });

  it("returns 409 with a clear reason when no terminal stage is finished (FR-13)", async () => {
    currentMockResults = {
      nominationId: "n1",
      nominationFinished: false,
      sections: [
        {
          stageId: "s1",
          stageTitle: "Групповой этап",
          stageType: StageType.GROUPS,
          finished: false,
          entries: [],
          placesFromOverallOrder: false,
        },
      ],
    };

    const res = await GET(req(), ctx());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/протокол появится/i);
  });

  it("returns 409 when there are no sections at all", async () => {
    currentMockResults = { nominationId: "n1", nominationFinished: false, sections: [] };

    const res = await GET(req(), ctx());
    expect(res.status).toBe(409);
  });

  it("returns a CSV file with the correct headers for a finished section (FR-12/FR-15/FR-16)", async () => {
    currentMockResults = {
      nominationId: "n1",
      nominationFinished: true,
      sections: [
        {
          stageId: "s1",
          stageTitle: "Плейофф",
          stageType: StageType.BRACKET,
          finished: true,
          entries: [
            {
              placeFrom: 1,
              placeTo: 1,
              fighter: { fighterId: "f1", name: "Иван Иванов", club: "Сокол" },
              originLabel: "Чемпион",
            },
            {
              placeFrom: 3,
              placeTo: 4,
              fighter: { fighterId: "f2", name: "Пётр, Петров", club: "" },
              originLabel: "выбыл в 1/2 финала",
            },
          ],
          placesFromOverallOrder: false,
        },
      ],
    };

    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="results.csv"');

    // `res.text()` декодирует UTF-8 и по спеке WHATWG съедает ведущий BOM —
    // проверяем его наличие по сырым байтам ответа (реальный скачанный файл
    // сохраняет BOM как есть, это artefact только Fetch API text()).
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const text = await res.text();
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("Этап,Место,Боец,Клуб,Происхождение места");
    expect(lines[1]).toBe("Плейофф,1,Иван Иванов,Сокол,Чемпион");
    // Значение с запятой экранируется кавычками (RFC 4180, FR-15).
    expect(lines[2]).toBe('Плейофф,3–4,"Пётр, Петров",,выбыл в 1/2 финала');
  });

  it("excludes unfinished sections even when another section of the same nomination is finished (FR-12)", async () => {
    currentMockResults = {
      nominationId: "n1",
      nominationFinished: false,
      sections: [
        {
          stageId: "s1",
          stageTitle: "Основная сетка",
          stageType: StageType.BRACKET,
          finished: true,
          entries: [
            {
              placeFrom: 1,
              placeTo: 1,
              fighter: { fighterId: "f1", name: "Чемпион", club: "" },
              originLabel: "Чемпион",
            },
          ],
          placesFromOverallOrder: false,
        },
        {
          stageId: "s2",
          stageTitle: "Утешительная сетка",
          stageType: StageType.BRACKET,
          finished: false,
          entries: [],
          placesFromOverallOrder: false,
        },
      ],
    };

    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Основная сетка");
    expect(text).not.toContain("Утешительная сетка");
  });

  it("maps ConnectError NotFound → 404", async () => {
    currentMockError = new ConnectError("not found", Code.NotFound);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });
});
