import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

type AssignBody = {
  fighterId: string;
  poolId: string;
};

/**
 * POST /api/stages/[stageId]/assign — DnD: положить бойца в пул (из
 * нераспределённых либо из другого пула — move одним действием, FR-5).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  let body: AssignBody;
  try {
    body = (await req.json()) as AssignBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.fighterId) {
    return NextResponse.json({ error: "fighterId is required" }, { status: 400 });
  }
  if (!body?.poolId) {
    return NextResponse.json({ error: "poolId is required" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.assignFighter(
      { stageId, fighterId: body.fighterId, poolId: body.poolId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ layout: poolLayoutToJson(res.layout) });
  } catch (err) {
    return errorResponse(err);
  }
}
