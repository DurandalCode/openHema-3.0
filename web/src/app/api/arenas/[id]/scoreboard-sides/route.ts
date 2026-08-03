import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaLiveToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type ScoreboardSidesBody = { swapped?: boolean };

/**
 * POST /api/arenas/[id]/scoreboard-sides — swap синий/красный (спека 0015,
 * FR-6): эфемерно, не запоминается за боём — сервер кеширует
 * `sides_swapped` в комнате арены и фанит `snapshot`. Только admin.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: ScoreboardSidesBody;
  try {
    body = (await req.json()) as ScoreboardSidesBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body?.swapped !== "boolean") {
    return NextResponse.json({ error: "swapped is required" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.setScoreboardSides(
      { arenaId: id, swapped: body.swapped },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ snapshot: arenaLiveToJson(res.snapshot) });
  } catch (err) {
    return errorResponse(err);
  }
}
