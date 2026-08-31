import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { formatPresetsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

/**
 * POST /api/formats/restore — восстановление встроенных пресетов формата
 * (только admin, спека 0047, FR-10): заводит записи каталога, которых в
 * библиотеке сейчас нет (по имени), остальные не трогает (FR-9). Тело
 * запроса пустое — каталог глобален, как и сама библиотека (0020,
 * FR-12) — тот же приём, что `GET /api/formats`.
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await stageAdminClient.restoreBuiltinPresets(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      restored: formatPresetsToJson(res.restored),
      skipped: res.skipped,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
