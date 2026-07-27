import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { boutBoardToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/arenas/[id]/board — доска ведения боёв арены (спека 0013, FR-14):
 * стоящий на ней пул, его бои по порядку и текущий бой. `board.pool` пуст,
 * если на арене никто не стоит. Только admin.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await poolAdminClient.getBoutBoard(
      { arenaId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ board: boutBoardToJson(res.board) });
  } catch (err) {
    return errorResponse(err);
  }
}
