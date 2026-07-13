import { NextResponse, type NextRequest } from "next/server";
import { arenaAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/admin/arenas/[id]/archive — убрать площадку в архив (только admin). */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await arenaAdminClient.archiveArena(
      { id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ arena: arenaToJson(res.arena) });
  } catch (err) {
    return errorResponse(err);
  }
}