import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/pool-status — тонкий срез раскладки для списка
 * номинаций: только `status` + `canUndo` (без пулов/бойцов, чтобы не тянуть
 * лишний payload). Маппит на тот же gRPC `GetLayout` и обрезает на BFF.
 * Только admin (требует access-токен; pool-layout — служебный).
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await poolAdminClient.getLayout(
      { nominationId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const layout = poolLayoutToJson(res.layout);
    return NextResponse.json({
      status: layout?.status ?? "POOL_LAYOUT_STATUS_UNSPECIFIED",
      canUndo: layout?.canUndo ?? false,
    });
  } catch (err) {
    return errorResponse(err);
  }
}