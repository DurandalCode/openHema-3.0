import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaLiveToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { TimerCommandKind } from "@/gen/hema/v1/pool_pb";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type TimerCommandBody = {
  kind: "START" | "PAUSE" | "RESET" | "ADJUST";
  amountSeconds?: number;
};

const KIND_TO_PROTO: Record<TimerCommandBody["kind"], TimerCommandKind> = {
  START: TimerCommandKind.START,
  PAUSE: TimerCommandKind.PAUSE,
  RESET: TimerCommandKind.RESET,
  ADJUST: TimerCommandKind.ADJUST,
};

function isValidKind(value: unknown): value is TimerCommandBody["kind"] {
  return value === "START" || value === "PAUSE" || value === "RESET" || value === "ADJUST";
}

/**
 * POST /api/arenas/[id]/timer — команда панели управления таймером (спека
 * 0015, FR-7): старт/пауза/сброс/±секунды. Сервер лишь ретранслирует команду
 * авторитетному табло через `WatchArenaBoard` (`command`-событие, ADR 0013)
 * — значение таймера сам не считает. Только admin.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: TimerCommandBody;
  try {
    body = (await req.json()) as TimerCommandBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!isValidKind(body?.kind)) {
    return NextResponse.json({ error: "unknown timer command kind" }, { status: 400 });
  }

  try {
    const res = await poolAdminClient.controlArenaTimer(
      {
        arenaId: id,
        command: { kind: KIND_TO_PROTO[body.kind], amountSeconds: body.amountSeconds ?? 0 },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ snapshot: arenaLiveToJson(res.snapshot) });
  } catch (err) {
    return errorResponse(err);
  }
}
