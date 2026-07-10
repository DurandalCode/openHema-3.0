import { NextResponse, type NextRequest } from "next/server";
import { applicationClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { applicationHistoryToJson, applicationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/applications/[id] — заявка с историей событий. Доступна владельцу
 * заявки или admin (проверяется сервером).
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await applicationClient.getApplication(
      { applicationId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      application: applicationToJson(res.application),
      history: applicationHistoryToJson(res.history),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
