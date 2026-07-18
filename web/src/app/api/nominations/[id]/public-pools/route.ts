import { NextResponse, type NextRequest } from "next/server";
import { poolPublicClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolsToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/public-pools — публичное чтение пулов номинации
 * (состав, статус, площадка, спека 0011, FR-11). Без авторизации — виден
 * всем (гость/боец). Показывает пулы только при готовой (`ready`) раскладке
 * номинации; при `draft` gRPC отдаёт пустой список (FR-11/AC-14) — BFF не
 * дублирует эту проверку.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const res = await poolPublicClient.listPublicPools({ nominationId: id });
    return NextResponse.json({ pools: poolsToJson(res.pools) });
  } catch (err) {
    return errorResponse(err);
  }
}
