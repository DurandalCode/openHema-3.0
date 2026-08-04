import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { stageToJson, stagesToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { StageType } from "@/gen/hema/v1/stage_pb";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type CreateStageBody = {
  type: "bracket";
  title: string;
  bracketSize: number;
  thirdPlace: boolean;
};

const VALID_BRACKET_SIZES = new Set([4, 8, 16, 32]);

/** GET /api/nominations/[id]/stages — список этапов номинации (только admin). */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await stageAdminClient.listStages(
      { nominationId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ stages: stagesToJson(res.stages) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/nominations/[id]/stages — создать этап-сетку номинации (спека
 * 0018, FR-2/FR-18): `title` непустой, `bracketSize` — степень двойки
 * 4/8/16/32 (валидация до похода на сервер). `type` пока принимает только
 * `"bracket"` — создание группового этапа через UI не входит в этот
 * инкремент (сервер также отклоняет `CreateStage` для `GROUPS`).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: CreateStageBody;
  try {
    body = (await req.json()) as CreateStageBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body?.type !== "bracket") {
    return NextResponse.json({ error: "type must be 'bracket'" }, { status: 400 });
  }
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!VALID_BRACKET_SIZES.has(body?.bracketSize)) {
    return NextResponse.json({ error: "bracketSize must be one of 4, 8, 16, 32" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.createStage(
      {
        nominationId: id,
        type: StageType.BRACKET,
        title: body.title,
        bracket: { size: body.bracketSize, thirdPlace: !!body.thirdPlace },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      created: stageToJson(res.created),
      stages: stagesToJson(res.stages),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
