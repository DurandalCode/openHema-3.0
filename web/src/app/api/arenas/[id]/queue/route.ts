import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolsForArenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type ReorderBody = { poolIds?: unknown };

/**
 * PUT /api/arenas/[id]/queue — задать порядок очереди арены целиком (спека
 * 0063, FR-6). Только admin. Набор id должен совпадать с текущей очередью,
 * иначе gRPC `FailedPrecondition` → 409 (очередь изменили параллельно,
 * NFR-3). Ответ — состояние страницы арены (seated/available/queued).
 */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: ReorderBody;
  try {
    body = (await req.json()) as ReorderBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const poolIds = body?.poolIds;
  if (!Array.isArray(poolIds) || !poolIds.every((p) => typeof p === "string")) {
    return NextResponse.json({ error: "poolIds must be an array of strings" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.reorderArenaQueue(
      { arenaId: id, poolIds: poolIds as string[] },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json(poolsForArenaToJson(res.pools));
  } catch (err) {
    return errorResponse(err);
  }
}
