import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type UnassignBody = {
  fighterId: string;
};

/**
 * POST /api/nominations/[id]/pool-unassign — DnD: вернуть бойца из пула в
 * нераспределённые (FR-5).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: UnassignBody;
  try {
    body = (await req.json()) as UnassignBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.fighterId) {
    return NextResponse.json({ error: "fighterId is required" }, { status: 400 });
  }

  try {
    const res = await poolAdminClient.unassignFighter(
      { nominationId: id, fighterId: body.fighterId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ layout: poolLayoutToJson(res.layout) });
  } catch (err) {
    return errorResponse(err);
  }
}
