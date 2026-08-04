import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

/**
 * POST /api/stages/[stageId]/distribute — «Распределить по группам»:
 * автораспределение нераспределённых бойцов по существующим пулам,
 * минимизируя одноклубников (FR-6/FR-7). Undoable.
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  try {
    const res = await stageAdminClient.autoDistribute(
      { stageId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ layout: poolLayoutToJson(res.layout) });
  } catch (err) {
    return errorResponse(err);
  }
}
