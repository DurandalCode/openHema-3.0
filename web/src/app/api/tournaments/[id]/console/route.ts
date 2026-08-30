import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { consoleSnapshotToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/tournaments/[id]/console — пульт турнира целиком одним
 * обращением (спека 0043, FR-8/FR-9/FR-19): все неархивные площадки с
 * темпом/прогнозом, все номинации с остатком боёв, очередь готовых пулов,
 * лента «требует внимания». Только admin (по образцу
 * `arena-boards/route.ts`, спека 0041).
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await stageAdminClient.getTournamentConsole(
      { tournamentId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ snapshot: consoleSnapshotToJson(res.snapshot) });
  } catch (err) {
    return errorResponse(err);
  }
}
