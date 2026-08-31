import { NextResponse, type NextRequest } from "next/server";
import { stagePublicClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { assertPreprodAccess } from "@/lib/grpc/preprod-guard";
import { nominationResultsToJson } from "@/lib/grpc/serialize";
import { emptyNominationResults } from "@/entities/nomination-results/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/results — итоговый протокол номинации (спека
 * 0021, FR-9..FR-19). Публичный, без авторизации — виден всем (гость/боец),
 * как остальные ручки `StagePublicService`. Используется админским экраном
 * схемы (`showUnfinished`, FR-19), где живой канал (0014) не нужен —
 * организатор сам обновляет страницу.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const gate = await assertPreprodAccess();
  if (gate) return gate;

  const { id } = await ctx.params;

  try {
    const res = await stagePublicClient.getNominationResults({ nominationId: id });
    return NextResponse.json({
      results: nominationResultsToJson(res.results) ?? emptyNominationResults(id),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
