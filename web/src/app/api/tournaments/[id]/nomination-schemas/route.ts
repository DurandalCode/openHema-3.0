import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { schemaIssuesToJson, stagesToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/tournaments/[id]/nomination-schemas — сводка схемы (этапы +
 * диагностика) всех номинаций турнира за одно обращение (спека 0041,
 * FR-8/FR-10) вместо одного `GET /api/nominations/[id]/stages` на каждую
 * номинацию (0028, NFR-2 — рассмотрено и отложено, теперь реализовано).
 * Холодные данные — читается по открытию экрана списка номинаций, без
 * периодического опроса (FR-10). Одна запись на номинацию, та же форма, что
 * у одиночного `ListStages` (`stagesToJson`/`schemaIssuesToJson` — те же
 * сериализаторы, что использует одиночный роут).
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await stageAdminClient.listStagesForTournament(
      { tournamentId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      entries: res.entries.map((entry) => ({
        nominationId: entry.nominationId,
        stages: stagesToJson(entry.stages),
        issues: schemaIssuesToJson(entry.issues),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
