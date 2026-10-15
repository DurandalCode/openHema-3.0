import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolsForArenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ poolId: string }> };

type EnqueueBody = { arenaId?: string };

/**
 * POST /api/pools/[poolId]/enqueue — добавить доступный для постановки пул
 * в конец очереди арены (спека 0063, FR-3..FR-5); пул из очереди другой
 * арены переносится. Только admin. gRPC `FailedPrecondition` → 409, если пул
 * не готов или стоит на арене. Ответ — состояние страницы арены
 * (seated/available/queued).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { poolId } = await ctx.params;

  let body: EnqueueBody;
  try {
    body = (await req.json()) as EnqueueBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const arenaId = body?.arenaId;
  if (!arenaId) {
    return NextResponse.json({ error: "arenaId is required" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.enqueuePool(
      { poolId, arenaId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json(poolsForArenaToJson(res.pools));
  } catch (err) {
    return errorResponse(err);
  }
}
