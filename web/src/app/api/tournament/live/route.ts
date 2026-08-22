import { NextResponse, type NextRequest } from "next/server";
import { stagePublicClient, tournamentClient } from "@/lib/grpc/client";
import { tournamentLiveToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/**
 * GET /api/tournament/live — SSE-канал живой сводки турнира целиком (спека
 * 0034, FR-19). Публичный, без авторизации. Первый кадр — текущая сводка,
 * далее по одному кадру на каждое изменение турнира (пул/бой любой
 * номинации), пока клиент подключён. Heartbeat (`: ping`) каждые ~20с — как
 * `/api/nominations/[id]/live`. Разрыв клиента (`req.signal`) отменяет
 * upstream server-streaming вызов и таймер.
 *
 * Без `[id]` в пути: маршрут сначала резолвит активный турнир тем же
 * вызовом, что `app/api/tournament/route.ts` (`getActiveTournament`) —
 * `WatchTournamentLiveRequest.tournament_id` обязателен и сервер не
 * подставляет активный турнир сам (см. `plan.md`, «Контракты»). Нет
 * активного турнира → 404 **до** открытия `ReadableStream` — в отличие от
 * `/api/nominations/[id]/live`, где id уже дан вызывающим и валидировать
 * заранее нечего, здесь резолв активного турнира предшествует самому
 * стримингу, поэтому есть возможность (и необходимость) ответить обычным
 * JSON-404 без старта потока, а не эмитить ошибку внутри уже открытого SSE.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const active = await tournamentClient.getActiveTournament({});
  const tournamentId = active.tournament?.id;
  if (!tournamentId) {
    return NextResponse.json({ error: "no active tournament" }, { status: 404 });
  }

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
        for await (const resp of stagePublicClient.watchTournamentLive(
          { tournamentId },
          { signal: req.signal },
        )) {
          const dto = tournamentLiveToJson(resp.snapshot);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(dto)}\n\n`));
        }
      } catch {
        // Отмена контекста клиентом (req.signal) — ожидаемое завершение
        // потока, не ошибка для зрителя.
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
