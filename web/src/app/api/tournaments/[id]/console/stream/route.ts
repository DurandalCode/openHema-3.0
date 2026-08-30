import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { consoleSnapshotToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/tournaments/[id]/console/stream — SSE-канал пульта турнира
 * (спека 0043, FR-18). Только admin: `getAccessToken` **до** открытия
 * `ReadableStream` (по образцу `/api/tournament/live`, где активный турнир
 * резолвится до старта потока) — нет токена → обычный JSON-401, а не
 * ошибка внутри уже открытого SSE. Первый кадр — текущий снапшот, далее по
 * одному кадру на каждый сигнал топика турнира (WatchTournamentConsole
 * переиспользует существующий топик `SubscribeTournament`, см.
 * doc-комментарий `AdminHandler.WatchTournamentConsole` на сервере — не
 * заводит второй канал сигналов). Heartbeat (`: ping`) каждые ~20с, как у
 * `/api/tournament/live`. Разрыв клиента (`req.signal`) отменяет upstream
 * server-streaming вызов и таймер.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id: tournamentId } = await ctx.params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // controller уже закрыт (гонка с cleanup) — heartbeat не критичен.
        }
      }, 20000);

      try {
        for await (const resp of stageAdminClient.watchTournamentConsole(
          { tournamentId },
          { headers: { Authorization: `Bearer ${accessToken}` }, signal: req.signal },
        )) {
          const dto = consoleSnapshotToJson(resp.snapshot);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(dto)}\n\n`));
        }
      } catch {
        // Отмена контекста клиентом (req.signal) — ожидаемое завершение
        // потока, не ошибка для оператора.
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // уже закрыт
        }
      }
    },
    cancel() {
      // Клиент отключился — upstream-итерация выше получит abort через
      // req.signal и остановится сама (finally уже почистит heartbeat).
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
