import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { bracketToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

/**
 * GET /api/stages/[stageId]/bracket — сетка этапа: круги/половины/пары/слоты
 * + нераспределённые бойцы (только admin, спека 0018, FR-7/FR-9/FR-13).
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  try {
    const res = await stageAdminClient.getBracket(
      { stageId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ bracket: bracketToJson(res.bracket) });
  } catch (err) {
    return errorResponse(err);
  }
}
