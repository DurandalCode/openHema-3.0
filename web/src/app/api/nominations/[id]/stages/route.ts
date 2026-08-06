import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { ruleDtoToProto, stageToJson, stagesToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { StageType } from "@/gen/hema/v1/stage_pb";
import type { SeedingRule as SeedingRuleDto } from "@/entities/stage/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type CreateStageBody = {
  type: "bracket" | "groups";
  title: string;
  bracketSize?: number;
  thirdPlace?: boolean;
  groupCount?: number;
  rule?: SeedingRuleDto;
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
 * POST /api/nominations/[id]/stages — создать явный этап номинации: сетку
 * (спека 0018, FR-2/FR-18, `type: "bracket"`) либо групповой этап (спека
 * 0019, FR-7/FR-8, `type: "groups"`). `title` непустой в обоих случаях;
 * `bracket` — `bracketSize` степень двойки 4/8/16/32, `groups` —
 * `groupCount >= 1` (валидация до похода на сервер). `rule`, если передан,
 * задаёт правило отбора тем же вызовом (FR-6) — можно и не передавать,
 * задать позже через `PUT /api/stages/[stageId]/rule`, пока состав пуст.
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
  if (body?.type !== "bracket" && body?.type !== "groups") {
    return NextResponse.json({ error: "type must be 'bracket' or 'groups'" }, { status: 400 });
  }
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (body.type === "bracket" && !VALID_BRACKET_SIZES.has(body?.bracketSize as number)) {
    return NextResponse.json({ error: "bracketSize must be one of 4, 8, 16, 32" }, { status: 400 });
  }
  if (body.type === "groups" && !(Number.isInteger(body?.groupCount) && (body.groupCount as number) >= 1)) {
    return NextResponse.json({ error: "groupCount must be an integer >= 1" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.createStage(
      {
        nominationId: id,
        type: body.type === "groups" ? StageType.GROUPS : StageType.BRACKET,
        title: body.title,
        bracket:
          body.type === "bracket"
            ? { size: body.bracketSize as number, thirdPlace: !!body.thirdPlace }
            : undefined,
        groups: body.type === "groups" ? { groupCount: body.groupCount as number } : undefined,
        rule: ruleDtoToProto(body.rule ?? null),
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
