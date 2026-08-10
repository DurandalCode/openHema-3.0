import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { stagesToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type ApplyFormatBody = {
  presetId?: string;
  sourceNominationId?: string;
};

/**
 * POST /api/nominations/[id]/format — применить формат целиком к номинации:
 * из пресета библиотеки либо копией схемы другой номинации того же турнира
 * (спека 0020, FR-13/FR-15). Ровно одно из полей `presetId`/
 * `sourceNominationId` должно быть задано — проверяем на BFF до похода на
 * сервер (оба или ни одного → 400), сервер тоже отклонил бы это
 * `ErrInvalidInput`, но незачем тратить round-trip. Гейт «схема номинации не
 * тронута» (нет членств/пулов на арене/начатых боёв) — на сервере
 * (`ErrSchemaNotEmpty` → `FailedPrecondition` → 409, FR-13/FR-14).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: ApplyFormatBody;
  try {
    body = (await req.json()) as ApplyFormatBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const hasPreset = !!body?.presetId;
  const hasSourceNomination = !!body?.sourceNominationId;
  if (hasPreset === hasSourceNomination) {
    return NextResponse.json(
      { error: "exactly one of presetId or sourceNominationId is required" },
      { status: 400 },
    );
  }

  try {
    const res = await stageAdminClient.applyFormat(
      {
        nominationId: id,
        source: hasPreset
          ? { case: "presetId" as const, value: body.presetId as string }
          : { case: "sourceNominationId" as const, value: body.sourceNominationId as string },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ stages: stagesToJson(res.stages) });
  } catch (err) {
    return errorResponse(err);
  }
}
