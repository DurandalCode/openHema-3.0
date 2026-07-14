import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/nominations/[id]/pool-undo — «Отменить»: откатить последнее
 * mutating-действие (автораспределение или удаление пула, FR-7a).
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await poolAdminClient.undo(
      { nominationId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ layout: poolLayoutToJson(res.layout) });
  } catch (err) {
    return errorResponse(err);
  }
}
