import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolsForArenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/arenas/[id]/pools — для страницы конкретной арены (спека 0011,
 * FR-9): пул, который сейчас на ней стоит (`seated`, `null` если арена
 * свободна), список готовых пулов, доступных для постановки (`available`),
 * и очередь арены по порядку (`queued`, спека 0063). Только admin.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await stageAdminClient.getPoolsForArena(
      { arenaId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json(poolsForArenaToJson(res));
  } catch (err) {
    return errorResponse(err);
  }
}
