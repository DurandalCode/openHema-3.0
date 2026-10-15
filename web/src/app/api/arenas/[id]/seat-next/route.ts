import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolsForArenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/arenas/[id]/seat-next — поставить первый пул очереди на свободную
 * арену и убрать его из очереди (спека 0063, FR-8/FR-9/FR-11). Только admin.
 * Единственный способ перехода очереди — автоматики нет. gRPC
 * `FailedPrecondition` → 409 (очередь пуста, арена занята или голова очереди
 * недоступна). Ответ — состояние страницы арены (seated/available/queued).
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await stageAdminClient.seatNextPool(
      { arenaId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json(poolsForArenaToJson(res.pools));
  } catch (err) {
    return errorResponse(err);
  }
}
