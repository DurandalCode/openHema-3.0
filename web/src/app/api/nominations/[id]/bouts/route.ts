import { NextResponse, type NextRequest } from "next/server";
import { boutAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { boutsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/bouts — бои всех пулов номинации, уже готовые
 * (сформированные при переходе раскладки пулов в ready, спека 0010). Только
 * admin (FR-8); публичного чтения нет в этом инкременте.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await boutAdminClient.listBoutsByNomination(
      { nominationId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ bouts: boutsToJson(res.bouts) });
  } catch (err) {
    return errorResponse(err);
  }
}
