import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectError, Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

import {
  ArenaAdminService,
  ArenaSchema,
  ArenaStatus,
  ListArenasResponseSchema,
  GetArenaResponseSchema,
  CreateArenaResponseSchema,
  UpdateArenaResponseSchema,
  ArchiveArenaResponseSchema,
  RestoreArenaResponseSchema,
  ReorderArenasResponseSchema,
  type Arena,
} from "@/gen/hema/v1/arena_pb";

// E2E-тест BFF route.ts: реальный arenaToJson + реальная proto
// binary-сериализация через createRouterTransport (in-process). НЕ мокаем
// serialize, НЕ подменяем client вручными vi.fn() — ловим proto3-omitted,
// NaN-enum, round-trip статусов и опциональных timestamp'ов. См. ADR 0010.

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));

// In-process transport делает реальную binary-сериализацию proto в обе
// стороны — это покрывает регрессии proto3-omitted и NaN-enum в BFF.
vi.mock("@/lib/grpc/client", async () => {
  return {
    arenaAdminClient: createClient(
      ArenaAdminService,
      createRouterTransport((router) => {
        router.service(ArenaAdminService, {
          listArenas: async () => {
            return create(ListArenasResponseSchema, { arenas: currentMockArenas });
          },
          getArena: async (req) => {
            const a = currentMockArenas.find((x) => x.id === req.id);
            if (!a) throw new ConnectError("not found", Code.NotFound);
            return create(GetArenaResponseSchema, { arena: a });
          },
          createArena: async (req) => {
            // Эмулируем server-side сохранение: возвращаем новую площадку как
            // proto-сообщение через create (запускает реальную binary-
            // сериализацию в транспорте).
            const created = create(ArenaSchema, {
              id: "new-arena-id",
              tournamentId: req.tournamentId,
              name: req.name,
              description: req.description,
              position: currentMockArenas.length,
              status: ArenaStatus.ACTIVE,
              createdAt: timestampFromDate(new Date("2026-07-13T00:00:00Z")),
              updatedAt: timestampFromDate(new Date("2026-07-13T00:00:00Z")),
            });
            currentMockArenas.push(created);
            return create(CreateArenaResponseSchema, { arena: created });
          },
          updateArena: async (req) => {
            const a = currentMockArenas.find((x) => x.id === req.id);
            if (!a) throw new ConnectError("not found", Code.NotFound);
            a.name = req.name;
            a.description = req.description;
            a.updatedAt = timestampFromDate(new Date("2026-07-14T00:00:00Z"));
            return create(UpdateArenaResponseSchema, { arena: a });
          },
          archiveArena: async (req) => {
            const a = currentMockArenas.find((x) => x.id === req.id);
            if (!a) throw new ConnectError("not found", Code.NotFound);
            a.status = ArenaStatus.ARCHIVED;
            return create(ArchiveArenaResponseSchema, { arena: a });
          },
          restoreArena: async (req) => {
            const a = currentMockArenas.find((x) => x.id === req.id);
            if (!a) throw new ConnectError("not found", Code.NotFound);
            a.status = ArenaStatus.ACTIVE;
            return create(RestoreArenaResponseSchema, { arena: a });
          },
          reorderArenas: async (req) => {
            const ordered: Arena[] = [];
            req.orderedIds.forEach((id, i) => {
              const a = currentMockArenas.find((x) => x.id === id);
              if (a) {
                a.position = i;
                ordered.push(a);
              }
            });
            return create(ReorderArenasResponseSchema, { arenas: ordered });
          },
        });
      }),
    ),
  };
});

import { getAccessToken } from "@/lib/session/cookies";
import { GET as listGet, POST as listPost } from "./route";
import { GET as idGet, PATCH as idPatch } from "./[id]/route";
import { POST as archivePost } from "./[id]/archive/route";
import { POST as restorePost } from "./[id]/restore/route";
import { POST as reorderPost } from "./reorder/route";

// Состояние mock-сервера между запросами (эмуляция PG).
let currentMockArenas: Arena[] = [];

describe("app/api/admin/arenas routes (e2e — real proto serialize)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    currentMockArenas = [];
  });

  function makeArena(id: string, name: string, position: number, status: ArenaStatus = ArenaStatus.ACTIVE): Arena {
    return create(ArenaSchema, {
      id,
      tournamentId: "t1",
      name,
      description: "описание",
      position,
      status,
      createdAt: timestampFromDate(new Date("2026-07-13T00:00:00Z")),
      updatedAt: timestampFromDate(new Date("2026-07-13T00:00:00Z")),
    });
  }

  describe("GET list", () => {
    it("returns normalized JSON for empty list (proto3-omitted regression)", async () => {
      // proto3 опускает пустой repeated — без нормализации arenasToJson
      // отдаёт undefined, и UI падает на .map(...).
      const res = await listGet(new NextRequest("http://localhost/api/admin/arenas?tournamentId=t1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.arenas).toEqual([]);
    });

    it("round-trips active and archived arenas through binary proto", async () => {
      currentMockArenas = [
        makeArena("a1", "Ристалище 1", 0, ArenaStatus.ACTIVE),
        makeArena("a2", "Архивная", 1, ArenaStatus.ARCHIVED),
      ];

      const res = await listGet(new NextRequest("http://localhost/api/admin/arenas?tournamentId=t1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.arenas).toHaveLength(2);
      expect(data.arenas[0].id).toBe("a1");
      expect(data.arenas[0].status).toBe("ARENA_STATUS_ACTIVE");
      expect(data.arenas[1].status).toBe("ARENA_STATUS_ARCHIVED");
      expect(data.arenas[0].createdAt).toContain("2026-07-13");
    });
  });

  describe("POST create", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const req = new NextRequest("http://localhost/api/admin/arenas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", name: "A" }),
      });
      const res = await listPost(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 on empty name", async () => {
      const req = new NextRequest("http://localhost/api/admin/arenas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", name: "   " }),
      });
      const res = await listPost(req);
      expect(res.status).toBe(400);
    });

    it("creates arena and round-trips through binary proto", async () => {
      const req = new NextRequest("http://localhost/api/admin/arenas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", name: "Главная арена", description: "У входа" }),
      });
      const res = await listPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.arena.id).toBe("new-arena-id");
      expect(data.arena.name).toBe("Главная арена");
      expect(data.arena.description).toBe("У входа");
      expect(data.arena.status).toBe("ARENA_STATUS_ACTIVE");
      expect(data.arena.position).toBe(0);
      expect(data.arena.tournamentId).toBe("t1");
      expect(data.arena.createdAt).toContain("2026-07-13");
    });
  });

  describe("GET [id]", () => {
    it("returns normalized JSON with proto3 defaults for empty description", async () => {
      // Сид: только обязательные поля, description опущен — BFF должен
      // нормализовать в "" (consumer ждёт строку, не undefined).
      currentMockArenas = [
        create(ArenaSchema, {
          id: "a1",
          tournamentId: "t1",
          name: "Площадка",
          position: 0,
          status: ArenaStatus.ACTIVE,
          createdAt: timestampFromDate(new Date("2026-07-13T00:00:00Z")),
          updatedAt: timestampFromDate(new Date("2026-07-13T00:00:00Z")),
        }),
      ];

      const req = new NextRequest("http://localhost/api/admin/arenas/a1");
      const res = await idGet(req, { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.arena.id).toBe("a1");
      expect(data.arena.description).toBe("");
      expect(data.arena.name).toBe("Площадка");
      expect(data.arena.status).toBe("ARENA_STATUS_ACTIVE");
    });

    it("maps ConnectError NotFound → 404", async () => {
      const req = new NextRequest("http://localhost/api/admin/arenas/does-not-exist");
      const res = await idGet(req, { params: Promise.resolve({ id: "does-not-exist" }) });
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH [id]", () => {
    it("updates name/description through binary proto", async () => {
      currentMockArenas = [makeArena("a1", "Old", 0)];

      const req = new NextRequest("http://localhost/api/admin/arenas/a1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New", description: "Updated" }),
      });
      const res = await idPatch(req, { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.arena.name).toBe("New");
      expect(data.arena.description).toBe("Updated");
      expect(data.arena.id).toBe("a1");
      expect(data.arena.updatedAt).toContain("2026-07-14");
    });

    it("returns 400 on empty name", async () => {
      currentMockArenas = [makeArena("a1", "Old", 0)];

      const req = new NextRequest("http://localhost/api/admin/arenas/a1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      });
      const res = await idPatch(req, { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(400);
    });
  });

  describe("POST [id]/archive", () => {
    it("round-trips status ACTIVE → ARCHIVED through binary proto", async () => {
      currentMockArenas = [makeArena("a1", "T", 0, ArenaStatus.ACTIVE)];

      const req = new NextRequest("http://localhost/api/admin/arenas/a1/archive", { method: "POST" });
      const res = await archivePost(req, { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.arena.status).toBe("ARENA_STATUS_ARCHIVED");
      expect(data.arena.id).toBe("a1");
    });

    it("maps ConnectError NotFound → 404", async () => {
      const req = new NextRequest("http://localhost/api/admin/arenas/x/archive", { method: "POST" });
      const res = await archivePost(req, { params: Promise.resolve({ id: "x" }) });
      expect(res.status).toBe(404);
    });
  });

  describe("POST [id]/restore", () => {
    it("round-trips status ARCHIVED → ACTIVE through binary proto", async () => {
      currentMockArenas = [makeArena("a1", "T", 0, ArenaStatus.ARCHIVED)];

      const req = new NextRequest("http://localhost/api/admin/arenas/a1/restore", { method: "POST" });
      const res = await restorePost(req, { params: Promise.resolve({ id: "a1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.arena.status).toBe("ARENA_STATUS_ACTIVE");
    });
  });

  describe("POST reorder", () => {
    it("returns 400 on missing tournamentId", async () => {
      const req = new NextRequest("http://localhost/api/admin/arenas/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ["a1"] }),
      });
      const res = await reorderPost(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 on empty orderedIds", async () => {
      const req = new NextRequest("http://localhost/api/admin/arenas/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", orderedIds: [] }),
      });
      const res = await reorderPost(req);
      expect(res.status).toBe(400);
    });

    it("round-trips reordered arenas through binary proto", async () => {
      currentMockArenas = [
        makeArena("a1", "A", 0),
        makeArena("a2", "B", 1),
        makeArena("a3", "C", 2),
      ];

      const req = new NextRequest("http://localhost/api/admin/arenas/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: "t1", orderedIds: ["a3", "a1", "a2"] }),
      });
      const res = await reorderPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.arenas).toHaveLength(3);
      expect(data.arenas[0].id).toBe("a3");
      expect(data.arenas[0].position).toBe(0);
      expect(data.arenas[1].id).toBe("a1");
      expect(data.arenas[1].position).toBe(1);
      expect(data.arenas[2].id).toBe("a2");
      expect(data.arenas[2].position).toBe(2);
    });
  });
});

// Заглушка неиспользуемого импорта (чтобы не дёргать tsc о noUnusedMatch).
void ConnectError;
void Code;