import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectError, Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

import {
  TournamentService,
  TournamentAdminService,
  TournamentSchema,
  GetActiveTournamentResponseSchema,
  UpdateActiveTournamentResponseSchema,
  ContactType,
  type Tournament,
} from "@/gen/hema/v1/tournament_pb";

// E2E-тест BFF route.ts: реальный tournamentToJson + реальная proto
// binary-сериализация через createRouterTransport (in-process). НЕ мокаем
// serialize, НЕ подменяем client вручными vi.fn() — ловим proto3-omitted,
// NaN-enum, round-trip опциональных timestamp'ов. См. ADR 0010.

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));

// Подменяем OCR-клиенты на in-process transport, регистрирующий mock-сервис.
// Транспорт делает реальную binary-сериализацию proto в обе стороны — это
// покрывает регрессии proto3-omitted и NaN-enum в BFF.
vi.mock("@/lib/grpc/client", async () => {
  return {
    tournamentClient: createClient(
      TournamentService,
      createRouterTransport((router) => {
        router.service(TournamentService, {
          getActiveTournament: async () => {
            return create(GetActiveTournamentResponseSchema, {
              tournament: currentMockTournament,
            });
          },
        });
      }),
    ),
    tournamentAdminClient: createClient(
      TournamentAdminService,
      createRouterTransport((router) => {
        router.service(TournamentAdminService, {
          updateActiveTournament: async (req) => {
            // Эмулируем server-side сохранение: возвращаем обновлённый турнир
            // как proto-сообщение (через create) — это запускает реальную
            // binary-сериализацию в транспорте.
            currentMockTournament = create(TournamentSchema, {
              id: "00000000-0000-0000-0000-000000000001",
              title: req.title,
              description: req.description,
              emblemUrl: req.emblemUrl,
              eventStartAt: req.eventStartAt,
              eventEndAt: req.eventEndAt,
              isActive: true,
              contacts: req.contacts.map((c, i) => ({
                id: `c${i + 1}`,
                type: c.type,
                value: c.value,
                position: i,
              })),
              createdAt: timestampFromDate(new Date("2026-01-01T00:00:00Z")),
              updatedAt: timestampFromDate(new Date("2026-07-08T00:00:00Z")),
            });
            return create(UpdateActiveTournamentResponseSchema, {
              tournament: currentMockTournament,
            });
          },
        });
      }),
    ),
  };
});

import { getAccessToken } from "@/lib/session/cookies";
import { GET, PUT } from "./route";

// Состояние mock-сервера между запросами (эмуляция PG).
let currentMockTournament: Tournament | undefined;

describe("app/api/tournament route (e2e — real proto serialize)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    currentMockTournament = undefined;
  });

  describe("GET", () => {
    it("returns normalized JSON for empty seed tournament (proto3-omitted regression)", async () => {
      // Сид: только id/isActive/timestamps; поля «пустой строки» и «пустой
      // repeated» proto3 опускает в toJson — BFF обязан нормализовать
      // (TournamentHero зовёт tournament.contacts.filter(...) → undefined → краш).
      currentMockTournament = create(TournamentSchema, {
        id: "00000000-0000-0000-0000-000000000001",
        isActive: true,
        createdAt: timestampFromDate(new Date("2026-01-01T00:00:00Z")),
        updatedAt: timestampFromDate(new Date("2026-07-08T00:00:00Z")),
      });

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();

      // Регрессия: без нормализации эти поля отсутствовали → UI крашился.
      expect(data.tournament.title).toBe("");
      expect(data.tournament.description).toBe("");
      expect(data.tournament.emblemUrl).toBe("");
      expect(data.tournament.contacts).toEqual([]);
      expect(data.tournament.isActive).toBe(true);
      expect(data.tournament.eventStartAt).toBe("");
      expect(data.tournament.eventEndAt).toBe("");
    });

    it("returns filled tournament with contacts and multi-day event range", async () => {
      currentMockTournament = create(TournamentSchema, {
        id: "t1",
        title: "HEMA Cup",
        description: "Annual",
        emblemUrl: "https://cdn/x.png",
        isActive: true,
        contacts: [
          { id: "c1", type: ContactType.TELEGRAM, value: "@org", position: 0 },
        ],
        eventStartAt: timestampFromDate(new Date("2026-12-01T10:00:00Z")),
        eventEndAt: timestampFromDate(new Date("2026-12-03T18:00:00Z")),
        createdAt: timestampFromDate(new Date("2026-01-01T00:00:00Z")),
        updatedAt: timestampFromDate(new Date("2026-07-07T00:00:00Z")),
      });

      const res = await GET();
      const data = await res.json();
      expect(data.tournament.title).toBe("HEMA Cup");
      expect(data.tournament.contacts).toHaveLength(1);
      expect(data.tournament.contacts[0].type).toBe("CONTACT_TYPE_TELEGRAM");
      // Timestamp → ISO-строка после toJson.
      expect(data.tournament.eventStartAt).toContain("2026-12-01T10:00:00");
      expect(data.tournament.eventEndAt).toContain("2026-12-03T18:00:00");
    });
  });

  describe("PUT", () => {
    function putReq(body: unknown) {
      return new NextRequest("http://localhost/api/tournament", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await PUT(putReq({ title: "T" }));
      expect(res.status).toBe(401);
    });

    it("returns 400 on empty title", async () => {
      const res = await PUT(putReq({ title: "   " }));
      expect(res.status).toBe(400);
    });

    // Регрессия NaN-enum: UI шлёт "CONTACT_TYPE_TELEGRAM", proto-поле — int32.
    // Неизвестное имя должно попасть в 400, не дойти до binary-сериализации
    // (где Number("CONTACT_TYPE_WHATEVER") → NaN → serialize error).
    it("returns 400 on unknown contact type string", async () => {
      const res = await PUT(putReq({
        title: "Cup",
        contacts: [{ type: "CONTACT_TYPE_WHATEVER", value: "x" }],
      }));
      expect(res.status).toBe(400);
    });

    it("round-trips valid multi-day tournament through binary proto", async () => {
      const res = await PUT(putReq({
        title: "Cup",
        description: "Multi-day",
        emblemUrl: "",
        eventStartAt: "2026-12-01T10:00:00.000Z",
        eventEndAt: "2026-12-03T18:00:00.000Z",
        contacts: [
          { type: "CONTACT_TYPE_TELEGRAM", value: "@org" },
          { type: "CONTACT_TYPE_WEBSITE", value: "https://x.test" },
        ],
      }));
      expect(res.status).toBe(200);
      const data = await res.json();

      // BFF передал в proto (enum string→int), proto вернул обратно, BFF
      // нормализовал через toJson — полная цепочка без NaN и без undefined.
      expect(data.tournament.title).toBe("Cup");
      expect(data.tournament.contacts).toHaveLength(2);
      expect(data.tournament.contacts[0].type).toBe("CONTACT_TYPE_TELEGRAM");
      expect(data.tournament.contacts[1].type).toBe("CONTACT_TYPE_WEBSITE");
      expect(data.tournament.contacts[0].position).toBe(0);
      expect(data.tournament.contacts[1].position).toBe(1);
      expect(data.tournament.eventStartAt).toContain("2026-12-01T10:00:00");
      expect(data.tournament.eventEndAt).toContain("2026-12-03T18:00:00");
    });

    it("round-trips single-day event (eventEndAt omitted)", async () => {
      const res = await PUT(putReq({
        title: "Single",
        eventStartAt: "2026-12-01T10:00:00.000Z",
      }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tournament.title).toBe("Single");
      expect(data.tournament.eventStartAt).toContain("2026-12-01");
      // eventEndAt не передан → proto3-omitted → нормализован в "".
      expect(data.tournament.eventEndAt).toBe("");
    });
  });
});

// Заглушка неиспользуемого импорта (чтобы не дёргать tsc о noUnusedMatch).
void ConnectError;
void Code;