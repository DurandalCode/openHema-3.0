import type { NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { arenaLiveToJson, timerCommandToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { ScoreboardRole } from "@/gen/hema/v1/pool_pb";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function parseRole(value: string | null): ScoreboardRole {
  if (value === "scoreboard") return ScoreboardRole.SCOREBOARD;
  if (value === "panel") return ScoreboardRole.PANEL;
  // Дефолт — панель (спека 0015): неизвестный/отсутствующий параметр не
  // должен случайно занять ordinal табло-источника.
  return ScoreboardRole.PANEL;
}

/**
 * GET /api/arenas/[id]/live — SSE-реле живого табло арены (спека 0015,
 * FR-3/FR-18; ADR 0013): по образцу `nominations/[id]/live` (0014), но
 * admin-only (FR-1) и по топику арены. `?role=scoreboard|panel` определяет
 * `ScoreboardRole` (нумерация табло — по порядку открытия, №1 источник,
 * FR-11/FR-12). Каждое событие потока — либо полный `snapshot`
 * (`ArenaLiveSnapshot`), либо ретранслированная `command` панели
 * авторитетному табло (сервер таймер сам не считает, ADR 0013 §1).
 * Heartbeat `: ping` каждые ~20с, cleanup по `req.signal`.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await ctx.params;
  const role = parseRole(req.nextUrl.searchParams.get("role"));
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
        for await (const resp of poolAdminClient.watchArenaBoard(
          { arenaId: id, role },
          { signal: req.signal, headers: { Authorization: `Bearer ${accessToken}` } },
        )) {
          const frame =
            resp.event.case === "snapshot"
              ? { type: "snapshot" as const, snapshot: arenaLiveToJson(resp.event.value) }
              : resp.event.case === "command"
                ? { type: "command" as const, command: timerCommandToJson(resp.event.value) }
                : null;
          if (frame) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
          }
        }
      } catch {
        // Отмена контекста клиентом (req.signal) — ожидаемое завершение
        // потока, не ошибка для табло/панели.
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
