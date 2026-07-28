import { NextResponse, type NextRequest } from "next/server";
import { arenaAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type DefaultDurationBody = { defaultDurationSeconds?: number };

/**
 * PUT /api/admin/arenas/[id]/default-duration — дефолтная длительность боя
 * арены (спека 0015, FR-8): недоменная настройка табло/таймера, персистентна
 * (в отличие от эфемерного хода таймера). Диапазон (1..3600) валидирует
 * сервер (`InvalidArgument` → 400 через `errorResponse`). Только admin.
 */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: DefaultDurationBody;
  try {
    body = (await req.json()) as DefaultDurationBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body?.defaultDurationSeconds !== "number") {
    return NextResponse.json({ error: "defaultDurationSeconds is required" }, { status: 400 });
  }

  try {
    const res = await arenaAdminClient.setArenaDefaultDuration(
      { arenaId: id, defaultDurationSeconds: body.defaultDurationSeconds },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ arena: arenaToJson(res.arena) });
  } catch (err) {
    return errorResponse(err);
  }
}
