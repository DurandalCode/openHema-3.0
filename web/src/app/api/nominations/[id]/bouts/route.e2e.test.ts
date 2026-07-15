import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectError, Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";

import {
  BoutAdminService,
  BoutSchema,
  ListBoutsByNominationResponseSchema,
  type Bout,
} from "@/gen/hema/v1/bout_pb";

// E2E-тест BFF route.ts: реальный boutsToJson + реальная proto binary-
// сериализация через createRouterTransport (in-process). НЕ мокаем serialize,
// НЕ подменяем client вручными vi.fn() — ловит proto3-omitted и round-trip
// вложенных сообщений (fighterA/fighterB). См. ADR 0010.

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));

let currentMockBouts: Bout[] = [];
let currentMockError: ConnectError | null = null;

vi.mock("@/lib/grpc/client", async () => {
  return {
    boutAdminClient: createClient(
      BoutAdminService,
      createRouterTransport((router) => {
        router.service(BoutAdminService, {
          listBoutsByNomination: async () => {
            if (currentMockError) throw currentMockError;
            return create(ListBoutsByNominationResponseSchema, { bouts: currentMockBouts });
          },
        });
      }),
    ),
  };
});

import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function makeBout(overrides: Partial<Omit<Bout, "$typeName" | "$unknown">>): Bout {
  return create(BoutSchema, {
    id: "bout-1",
    poolId: "pool-1",
    nominationId: "nom-1",
    roundNumber: 1,
    sequenceNumber: 1,
    fighterA: { fighterId: "f-a", name: "Боец A", club: "Клуб A" },
    fighterB: { fighterId: "f-b", name: "Боец B", club: "" },
    ...overrides,
  });
}

function req() {
  return new NextRequest("http://localhost/api/nominations/n1/bouts");
}

describe("app/api/nominations/[id]/bouts route (e2e — real proto serialize)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    currentMockBouts = [];
    currentMockError = null;
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
  });

  it("returns empty list JSON (proto3-omitted regression)", async () => {
    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bouts).toEqual([]);
  });

  it("round-trips bouts of multiple pools through binary proto", async () => {
    currentMockBouts = [
      makeBout({ id: "b1", poolId: "p1", sequenceNumber: 1, roundNumber: 1 }),
      makeBout({ id: "b2", poolId: "p2", sequenceNumber: 1, roundNumber: 1 }),
      makeBout({ id: "b3", poolId: "p1", sequenceNumber: 2, roundNumber: 2 }),
    ];

    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bouts).toHaveLength(3);
    expect(data.bouts[0]).toEqual({
      id: "b1",
      poolId: "p1",
      nominationId: "nom-1",
      roundNumber: 1,
      sequenceNumber: 1,
      fighterA: { fighterId: "f-a", name: "Боец A", club: "Клуб A" },
      fighterB: { fighterId: "f-b", name: "Боец B", club: "" },
    });
    expect(data.bouts[1].poolId).toBe("p2");
    expect(data.bouts[2].roundNumber).toBe(2);
  });

  it("maps ConnectError PermissionDenied → 403", async () => {
    currentMockError = new ConnectError("forbidden", Code.PermissionDenied);
    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(403);
  });

  it("maps ConnectError Unauthenticated → 401", async () => {
    currentMockError = new ConnectError("unauthenticated", Code.Unauthenticated);
    const res = await GET(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
  });
});
