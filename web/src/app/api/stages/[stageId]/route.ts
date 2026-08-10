import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { stageToJson, stagesToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { BracketConfig as BracketConfigDto, GroupsConfig as GroupsConfigDto } from "@/entities/stage/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

type UpdateStageBody = {
  title: string;
  bracket?: BracketConfigDto;
  groups?: GroupsConfigDto;
};

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

/**
 * PATCH /api/stages/[stageId] — переименовать этап и/или сменить его конфиг
 * (спека 0020, FR-2). `bracket`/`groups` в теле опциональны — какое из двух
 * прислать решает клиент (features), сервер отклоняет конфиг, не
 * соответствующий типу этапа (`InvalidArgument` → 400); тип этапа в запросе
 * отсутствует — сменить его нечем. Гейт «состав не пуст» (`ErrStageLocked` →
 * `FailedPrecondition` → 409) применяется только когда конфиг реально
 * меняется — переименование доступно всегда.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  let body: UpdateStageBody;
  try {
    body = (await req.json()) as UpdateStageBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.updateStage(
      {
        stageId,
        title: body.title,
        bracket: body.bracket,
        groups: body.groups,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ stage: stageToJson(res.stage) });
  } catch (err) {
    return errorResponse(err);
  }
}
