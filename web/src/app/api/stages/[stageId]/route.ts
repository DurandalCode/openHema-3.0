import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { stagesToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

/**
 * DELETE /api/stages/[stageId] — удалить этап (только admin, спека 0018,
 * FR-18/AC-14): сервер отклоняет групповой этап и этап с начатыми боями
 * (`FailedPrecondition` → 409).
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  try {
    const res = await stageAdminClient.deleteStage(
      { stageId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ stages: stagesToJson(res.stages) });
  } catch (err) {
    return errorResponse(err);
  }
}
