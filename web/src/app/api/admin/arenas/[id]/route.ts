import { NextResponse, type NextRequest } from "next/server";
import { arenaAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type UpdateBody = {
  name: string;
  description?: string;
};

/** GET /api/admin/arenas/[id] — одна площадка (только admin, для страницы управления). */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await arenaAdminClient.getArena(
      { id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ arena: arenaToJson(res.arena) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/admin/arenas/[id] — правка name/description площадки (только admin). */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.name || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const res = await arenaAdminClient.updateArena(
      { id, name: body.name, description: body.description ?? "" },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ arena: arenaToJson(res.arena) });
  } catch (err) {
    return errorResponse(err);
  }
}