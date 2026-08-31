import type { NextRequest } from "next/server";
import { stagePublicClient } from "@/lib/grpc/client";
import { assertPreprodAccess } from "@/lib/grpc/preprod-guard";
import { nominationLiveToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/live — SSE-канал живого снапшота номинации
 * (спека 0014, FR-6/FR-8). Публичный, без авторизации. Первый кадр —
 * текущий снапшот, далее по одному кадру на каждое изменение номинации
 * (пул/бой), пока клиент подключён. Heartbeat (`: ping`) каждые ~20с —
 * снижает риск буферизации/таймаута на прокси. Разрыв клиента (`req.signal`)
 * отменяет upstream server-streaming вызов и таймер (cleanup, нет утечки).
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const gate = await assertPreprodAccess();
  if (gate) return gate;

  const { id } = await ctx.params;
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
        for await (const resp of stagePublicClient.watchNominationLive(
          { nominationId: id },
          { signal: req.signal },
        )) {
          const dto = nominationLiveToJson(resp.snapshot);
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
