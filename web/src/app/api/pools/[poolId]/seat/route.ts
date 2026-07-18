import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ poolId: string }> };

type SeatBody = { arenaId?: string };

/**
 * POST /api/pools/[poolId]/seat — поставить готовый пул на арену целиком,
 * вместе с его боями (спека 0011, FR-7). Только admin. Отклоняется gRPC
 * (`FailedPrecondition` → 409), если пул не готов, уже стоит на арене, либо
 * арена занята/архивна (AC-5/AC-6/AC-7/AC-9).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { poolId } = await ctx.params;

  let body: SeatBody;
  try {
    body = (await req.json()) as SeatBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const arenaId = body?.arenaId;
  if (!arenaId) {
    return NextResponse.json({ error: "arenaId is required" }, { status: 400 });
  }

  try {
    const res = await poolAdminClient.seatPoolOnArena(
      { poolId, arenaId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ layout: poolLayoutToJson(res.layout) });
  } catch (err) {
    return errorResponse(err);
  }
}
