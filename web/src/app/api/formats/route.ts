import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { formatPresetToJson, formatPresetsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type SavePresetBody = {
  name: string;
  nominationId: string;
};

/**
 * GET /api/formats — библиотека пресетов формата целиком (только admin,
 * спека 0020, FR-12). Библиотека глобальна (не привязана к турниру/
 * номинации), поэтому параметров нет.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await stageAdminClient.listFormatPresets(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ presets: formatPresetsToJson(res.presets) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/formats — сохранить текущую схему номинации как именованный
 * пресет библиотеки (только admin, спека 0020, FR-11/FR-12). Пресет — отпечаток
 * уже существующей схемы: тело берёт `nominationId`, не схему целиком.
 * Занятое имя (без учёта регистра) → `AlreadyExists` → 409.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: SavePresetBody;
  try {
    body = (await req.json()) as SavePresetBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body?.nominationId) {
    return NextResponse.json({ error: "nominationId is required" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.saveFormatPreset(
      { name: body.name, nominationId: body.nominationId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ preset: formatPresetToJson(res.preset) });
  } catch (err) {
    return errorResponse(err);
  }
}
