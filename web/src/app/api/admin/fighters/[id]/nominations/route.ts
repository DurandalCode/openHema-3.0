import { NextResponse, type NextRequest } from "next/server";
import { fighterAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type AddBody = {
  nominationId: string;
};

/** POST /api/admin/fighters/[id]/nominations — добавить участие (только admin). */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.nominationId) {
    return NextResponse.json({ error: "nominationId is required" }, { status: 400 });
  }

  try {
    const res = await fighterAdminClient.addToNomination(
      { fighterId: id, nominationId: body.nominationId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: fighterToJson(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DELETE /api/admin/fighters/[id]/nominations?nominationId=... — снять
 * бойца с одной номинации (только admin). Обратимо (повторный POST).
 */
export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const nominationId = req.nextUrl.searchParams.get("nominationId");
  if (!nominationId) {
    return NextResponse.json({ error: "nominationId is required" }, { status: 400 });
  }

  try {
    const res = await fighterAdminClient.removeFromNomination(
      { fighterId: id, nominationId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: fighterToJson(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}
