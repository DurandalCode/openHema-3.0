import { NextResponse, type NextRequest } from "next/server";
import { arenaAdminClient, poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/arenas/[id]/archive — убрать площадку в архив (только
 * admin). Гейт FR-10 (спека 0011): нельзя архивировать арену, на которой
 * стоит пул — сначала проверяем занятость через GetPoolsForArena и, если
 * пул на арене есть, отклоняем запрос 409, не доходя до ArchiveArena. Гейт
 * живёт в BFF (композиция pool+arena), не в arena-модуле — иначе
 * межмодульная зависимость arena → pool замкнула бы цикл с уже введённой
 * pool → arena (ADR 0002, plan.md «Риски»).
 */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const authHeaders = { headers: { Authorization: `Bearer ${accessToken}` } };

  try {
    const pools = await poolAdminClient.getPoolsForArena({ arenaId: id }, authHeaders);
    if (pools.seated) {
      return NextResponse.json(
        { error: "arena has a seated pool, unseat it before archiving" },
        { status: 409 },
      );
    }

    const res = await arenaAdminClient.archiveArena({ id }, authHeaders);
    return NextResponse.json({ arena: arenaToJson(res.arena) });
  } catch (err) {
    return errorResponse(err);
  }
}