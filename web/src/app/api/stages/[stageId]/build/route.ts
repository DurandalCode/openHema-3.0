import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { bracketToJson, poolLayoutToJson, tieResolutionDtoToProto } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { TieResolution as TieResolutionDto } from "@/entities/stage/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

type BuildBody = {
  ties?: TieResolutionDto[];
};

/**
 * POST /api/stages/[stageId]/build — сформировать этап (спека 0019, FR-16):
 * применяет план отбора и раскладки одной транзакцией. Гейты («состав
 * пуст», неразрешённые дележи, пересечения выборок, переполнение) — на
 * сервере, маппятся в HTTP через `errorResponse`. Ответ — ровно одно из
 * `layout`/`bracket` непусто (`oneof BuildStageResponse.result`, groupовой
 * целевой этап отдаёт свою раскладку, целевая сетка — свой вид).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  let body: BuildBody;
  try {
    body = (await req.json()) as BuildBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.buildStage(
      { stageId, ties: (body?.ties ?? []).map(tieResolutionDtoToProto) },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      layout: res.result.case === "layout" ? poolLayoutToJson(res.result.value) : null,
      bracket: res.result.case === "bracket" ? bracketToJson(res.result.value) : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
