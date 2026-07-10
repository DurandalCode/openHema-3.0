import { NextResponse, type NextRequest } from "next/server";
import { applicationAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { applicationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/applications/[id]/register — зарегистрировать оплаченную заявку
 * (секретарь/admin; терминальный шаг флоу). Ответ несёт `capacityExceeded` —
 * мягкое предупреждение о переполнении номинации (soft cap), не блокирующее.
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await applicationAdminClient.registerFighter(
      { applicationId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      application: applicationToJson(res.application),
      capacityExceeded: res.capacityExceeded,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
