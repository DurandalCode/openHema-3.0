import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { boutBoardToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/tournaments/[id]/arena-boards — доска ведения боёв каждой
 * неархивной площадки турнира за одно обращение (спека 0041, FR-7/FR-9):
 * заменяет N параллельных `GET /api/arenas/[id]/board` за цикл обновления
 * одним агрегирующим запросом. `board` записи пуст, если на площадке никто
 * не стоит — та же семантика, что у одиночного `GetBoutBoard`. Только admin.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await stageAdminClient.getArenaBoards(
      { tournamentId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({
      entries: res.entries.map((entry) => ({
        arenaId: entry.arenaId,
        board: boutBoardToJson(entry.board),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
