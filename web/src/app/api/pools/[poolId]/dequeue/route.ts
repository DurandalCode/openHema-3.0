import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolsForArenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ poolId: string }> };

/**
 * POST /api/pools/[poolId]/dequeue — убрать пул из очереди арены (спека
 * 0063, FR-6). Только admin. Арена берётся сервером из записи очереди.
 * Ответ — состояние страницы арены (seated/available/queued).
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { poolId } = await ctx.params;

  try {
    const res = await stageAdminClient.dequeuePool(
      { poolId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json(poolsForArenaToJson(res.pools));
  } catch (err) {
    return errorResponse(err);
  }
}
