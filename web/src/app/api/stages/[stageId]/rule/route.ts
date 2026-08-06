import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { ruleDtoToProto, stageToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { SeedingRule as SeedingRuleDto } from "@/entities/stage/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

type SetRuleBody = {
  rule: SeedingRuleDto | null;
};

/**
 * PUT /api/stages/[stageId]/rule — задать (или снять, `rule: null`) правило
 * отбора этапа (спека 0019, FR-1/FR-6). Валидация правила (источник/
 * селектор/границы мест) и гейты («состав пуст», «групповой этап без числа
 * групп») — на сервере (`SetStageRule`); BFF только пробрасывает тело.
 */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  let body: SetRuleBody;
  try {
    body = (await req.json()) as SetRuleBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.setStageRule(
      { stageId, rule: ruleDtoToProto(body?.rule ?? null) },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ stage: stageToJson(res.stage) });
  } catch (err) {
    return errorResponse(err);
  }
}
