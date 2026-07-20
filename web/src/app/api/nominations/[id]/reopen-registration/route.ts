import { NextResponse, type NextRequest } from "next/server";
import { nominationAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { nominationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/nominations/[id]/reopen-registration — открыть приём заявок
 * обратно (спека 0012, FR-3/FR-4, только admin). Разрешено сервером только
 * если закрытие было ручным и сейчас нет распределённых бойцов — иначе
 * `FailedPrecondition` → BFF мапит его в 409 (`errorResponse`, как везде).
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await nominationAdminClient.reopenRegistration(
      { id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ nomination: nominationToJson(res.nomination) });
  } catch (err) {
    return errorResponse(err);
  }
}
