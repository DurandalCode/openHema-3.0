import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { stageBuildPreviewToJson, tieResolutionDtoToProto } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { TieResolution as TieResolutionDto } from "@/entities/stage/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

type PreviewBuildBody = {
  ties?: TieResolutionDto[];
};

/**
 * POST /api/stages/[stageId]/build/preview — превью формирования этапа
 * (спека 0019, FR-15): отобранные бойцы, их происхождение и целевые слоты,
 * нераспределённые, пересечения с соседними ветками (FR-11), неразрешённые
 * дележи (FR-22) и число незавершённых боёв источника (FR-14). `ties` —
 * ответы организатора на предыдущий раунд дележей; пустой массив/отсутствие
 * — превью без ответов (первый заход).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  let body: PreviewBuildBody;
  try {
    body = (await req.json()) as PreviewBuildBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.previewStageBuild(
      { stageId, ties: (body?.ties ?? []).map(tieResolutionDtoToProto) },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ preview: stageBuildPreviewToJson(res.preview) });
  } catch (err) {
    return errorResponse(err);
  }
}
