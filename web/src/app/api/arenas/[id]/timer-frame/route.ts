import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaLiveToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { TimerStatus } from "@/gen/hema/v1/pool_pb";
import type { TimerStatusDto } from "@/entities/arena-live/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const STATUS_TO_PROTO: Record<TimerStatusDto, TimerStatus> = {
  TIMER_STATUS_UNSPECIFIED: TimerStatus.UNSPECIFIED,
  TIMER_STATUS_STOPPED: TimerStatus.STOPPED,
  TIMER_STATUS_RUNNING: TimerStatus.RUNNING,
  TIMER_STATUS_PAUSED: TimerStatus.PAUSED,
  TIMER_STATUS_EXPIRED: TimerStatus.EXPIRED,
};

type TimerFrameBody = {
  status: TimerStatusDto;
  remainingCs: number;
  sampledUnixMs: number | string;
  defaultCs: number;
};

/**
 * POST /api/arenas/[id]/timer-frame — публикация полного кадра таймера
 * авторитетным табло №1 (спека 0015, ADR 0013 §2): сервер лишь кеширует и
 * фанит `snapshot` в комнату — не считает таймер сам. Отклоняется сервером
 * (`FailedPrecondition`), если вызывающий поток — не источник комнаты. Только
 * admin.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as TimerFrameBody;

  try {
    const res = await poolAdminClient.publishTimerFrame(
      {
        arenaId: id,
        frame: {
          status: STATUS_TO_PROTO[body.status] ?? TimerStatus.UNSPECIFIED,
          remainingCs: body.remainingCs,
          sampledUnixMs: BigInt(body.sampledUnixMs),
          defaultCs: body.defaultCs,
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ snapshot: arenaLiveToJson(res.snapshot) });
  } catch (err) {
    return errorResponse(err);
  }
}
