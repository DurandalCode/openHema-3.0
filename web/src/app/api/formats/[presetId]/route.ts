import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { formatPresetToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ presetId: string }> };

type RenamePresetBody = {
  name: string;
};

/**
 * PATCH /api/formats/[presetId] — переименовать пресет, не трогая его схему
 * и уже применённые к номинациям копии (только admin, спека 0020, FR-12).
 * Занятое имя (без учёта регистра) → `AlreadyExists` → 409.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { presetId } = await ctx.params;

  let body: RenamePresetBody;
  try {
    body = (await req.json()) as RenamePresetBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.renameFormatPreset(
      { presetId, name: body.name },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ preset: formatPresetToJson(res.preset) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DELETE /api/formats/[presetId] — удалить пресет из библиотеки (только
 * admin, спека 0020, FR-12). Номинации, к которым он уже применялся, не
 * затрагиваются (копия по значению, FR-16). Несуществующий пресет →
 * `NotFound` → 404.
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { presetId } = await ctx.params;

  try {
    await stageAdminClient.deleteFormatPreset(
      { presetId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({});
  } catch (err) {
    return errorResponse(err);
  }
}
