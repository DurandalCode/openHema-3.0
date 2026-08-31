import { NextResponse } from "next/server";
import { stagePublicClient, tournamentClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { assertPreprodAccess } from "@/lib/grpc/preprod-guard";
import { tournamentLiveToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/**
 * GET /api/tournament/live-snapshot — unary-фолбэк живой сводки турнира
 * целиком (спека 0034, NFR-2): используется клиентским хуком
 * `useTournamentLive`, когда SSE недоступен, а также для SSR того же shape,
 * что один кадр `/live`. Публичный, без авторизации.
 *
 * Без `[id]` в пути (в отличие от `/api/nominations/[id]/live-snapshot`):
 * `GetTournamentLiveRequest.tournament_id` обязателен и сервер не
 * подставляет активный турнир сам (см. `plan.md`, «Контракты») — маршрут
 * сначала резолвит активный турнир тем же вызовом, что и
 * `app/api/tournament/route.ts` (`getActiveTournament`), и только с его id
 * зовёт `GetTournamentLive`. Нет активного турнира → 404 без похода в
 * сводку.
 */
export async function GET(): Promise<NextResponse> {
  const gate = await assertPreprodAccess();
  if (gate) return gate;

  try {
    const active = await tournamentClient.getActiveTournament({});
    const tournamentId = active.tournament?.id;
    if (!tournamentId) {
      return NextResponse.json({ error: "no active tournament" }, { status: 404 });
    }

    const res = await stagePublicClient.getTournamentLive({ tournamentId });
    return NextResponse.json({ snapshot: tournamentLiveToJson(res.snapshot) });
  } catch (err) {
    return errorResponse(err);
  }
}
