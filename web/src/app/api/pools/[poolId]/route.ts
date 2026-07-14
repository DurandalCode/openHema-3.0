import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ poolId: string }> };

/**
 * DELETE /api/pools/[poolId] — удалить пул; его бойцы возвращаются в
 * нераспределённые (только admin, undoable — FR-4/FR-7a).
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { poolId } = await ctx.params;

  try {
    const res = await poolAdminClient.deletePool(
      { poolId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ layout: poolLayoutToJson(res.layout) });
  } catch (err) {
    return errorResponse(err);
  }
}
