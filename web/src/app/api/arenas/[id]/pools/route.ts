import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolToJson, poolsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/arenas/[id]/pools — для страницы конкретной арены (спека 0011,
 * FR-9): пул, который сейчас на ней стоит (`seated`, `null` если арена
 * свободна), и список готовых пулов, доступных для постановки
 * (`available`). Только admin.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await poolAdminClient.getPoolsForArena(
      { arenaId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      seated: poolToJson(res.seated),
      available: poolsToJson(res.available),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
