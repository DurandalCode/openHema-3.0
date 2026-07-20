import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { boutBoardToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ poolId: string }> };

type CurrentBoutBody = { boutId?: string };

/**
 * PUT /api/pools/[poolId]/current-bout — циркуляция по пулу (спека 0013,
 * FR-8): назначить текущим любой бой пула, включая уже завершённый. Только
 * admin.
 */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { poolId } = await ctx.params;

  let body: CurrentBoutBody;
  try {
    body = (await req.json()) as CurrentBoutBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const boutId = body?.boutId;
  if (!boutId) {
    return NextResponse.json({ error: "boutId is required" }, { status: 400 });
  }

  try {
    const res = await poolAdminClient.setCurrentBout(
      { poolId, boutId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ board: boutBoardToJson(res.board) });
  } catch (err) {
    return errorResponse(err);
  }
}
