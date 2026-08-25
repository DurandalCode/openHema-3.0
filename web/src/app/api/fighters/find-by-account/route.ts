import { NextResponse, type NextRequest } from "next/server";
import { fighterAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { toFighterDto } from "../to-fighter-dto";

export const runtime = "nodejs";

/**
 * GET /api/fighters/find-by-account?userId=...&tournamentId=... — поиск
 * бойца турнира по учётке пользователя (admin, спека 0040, FR-9).
 * `tournamentId` опционален — пусто → активный турнир (тот же приём, что
 * `GET /api/admin/fighters`/`ListRoster`). Пустой `fighter: null` в ответе —
 * «у этой учётки нет бойца в этом турнире», не ошибка (тот же приём, что
 * `GetMyFighter`/FR-41 спеки 0038).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const tournamentId = req.nextUrl.searchParams.get("tournamentId") ?? undefined;

  try {
    const res = await fighterAdminClient.findFighterByAccount(
      { userId, tournamentId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: toFighterDto(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}
