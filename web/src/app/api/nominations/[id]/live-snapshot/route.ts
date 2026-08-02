import { NextResponse, type NextRequest } from "next/server";
import { stagePublicClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { nominationLiveToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/live-snapshot — unary-фолбэк живого снапшота
 * номинации (спека 0014, NFR-2): используется клиентским хуком, когда SSE
 * недоступен (старый браузер/прокси/серия ошибок), а также может служить
 * для SSR того же shape, что один кадр `/live`. Публичный, без авторизации.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const res = await stagePublicClient.getNominationLive({ nominationId: id });
    return NextResponse.json({ snapshot: nominationLiveToJson(res.snapshot) });
  } catch (err) {
    return errorResponse(err);
  }
}
