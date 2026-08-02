import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaLiveToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/arenas/[id]/reveal-bout — секретарь явно показывает текущий бой
 * на всех подключённых табло (спека 0015, UX-уточнение): развязывает
 * оглашение результата (Завершить) и переход к следующему бою на табло на
 * разные действия панели. Чисто отображенческий сигнал — сервер
 * инкрементирует эфемерный `room.reveal_generation` и рассылает его всем
 * табло комнаты. Только admin.
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await poolAdminClient.revealCurrentBout(
      { arenaId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ snapshot: arenaLiveToJson(res.snapshot) });
  } catch (err) {
    return errorResponse(err);
  }
}
