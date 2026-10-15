import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";

import {
  StageAdminService,
  StagePublicService,
  EnqueuePoolResponseSchema,
  GetPoolsForArenaResponseSchema,
  PoolSchema,
  type Pool,
} from "@/gen/hema/v1/stage_pb";

// E2E-тест BFF route.ts (ADR 0010): реальный poolsForArenaToJson + реальная
// proto-сериализация через createRouterTransport. Ловит proto3-omitted
// (queueArenaId/stageTitle пусты, queuePosition = 0) и порядок queued.

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/grpc/client", async () => {
  return {
    stageAdminClient: createClient(
      StageAdminService,
      createRouterTransport((router) => {
        router.service(StageAdminService, {
          enqueuePool: async () =>
            create(EnqueuePoolResponseSchema, {
              pools: create(GetPoolsForArenaResponseSchema, { available: mockAvailable, queued: mockQueued }),
            }),
        });
      }),
    ),
    stagePublicClient: createClient(StagePublicService, createRouterTransport(() => {})),
  };
});

import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

let mockAvailable: Pool[] = [];
let mockQueued: Pool[] = [];

function postReq() {
  return new NextRequest("http://localhost/api/pools/p1/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arenaId: "a1" }),
  });
}

describe("app/api/pools/[poolId]/enqueue route (e2e — real proto serialize)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    mockAvailable = [];
    mockQueued = [];
  });

  it("returns empty collections and seated=null when nothing is set", async () => {
    const res = await POST(postReq(), { params: Promise.resolve({ poolId: "p1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ seated: null, available: [], queued: [] });
  });

  it("round-trips queued pools in order with stage title and queue fields", async () => {
    mockQueued = [
      create(PoolSchema, {
        id: "p1",
        nominationId: "n1",
        name: "1/4 финала, верхняя половина",
        stageTitle: "Основная сетка",
        queueArenaId: "a1",
        queueArenaName: "Арена 1",
        queuePosition: 1,
      }),
      create(PoolSchema, { id: "p2", nominationId: "n1", name: "Пул 2", queuePosition: 2 }),
    ];
    mockAvailable = [create(PoolSchema, { id: "p3", nominationId: "n1", name: "Пул 3" })];

    const res = await POST(postReq(), { params: Promise.resolve({ poolId: "p1" }) });
    const data = await res.json();

    expect(data.queued.map((p: { id: string }) => p.id)).toEqual(["p1", "p2"]);
    expect(data.queued[0]).toMatchObject({
      stageTitle: "Основная сетка",
      queueArenaId: "a1",
      queueArenaName: "Арена 1",
      queuePosition: 1,
    });
    // proto3-omitted → пустая строка / 0, не undefined.
    expect(data.available[0]).toMatchObject({
      stageTitle: "",
      queueArenaId: "",
      queueArenaName: "",
      queuePosition: 0,
    });
  });
});
