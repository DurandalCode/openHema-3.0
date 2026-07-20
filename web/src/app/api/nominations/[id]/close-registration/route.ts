import { NextResponse, type NextRequest } from "next/server";
import { nominationAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { nominationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/nominations/[id]/close-registration — вручную закрыть приём
 * заявок номинации (спека 0012, FR-3, только admin). Идемпотентный no-op на
 * сервере, если уже закрыта (любая причина) — BFF ничего не решает, просто
 * проксирует.
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await nominationAdminClient.closeRegistration(
      { id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ nomination: nominationToJson(res.nomination) });
  } catch (err) {
    return errorResponse(err);
  }
}
