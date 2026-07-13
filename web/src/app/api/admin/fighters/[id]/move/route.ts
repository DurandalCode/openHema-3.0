import { NextResponse, type NextRequest } from "next/server";
import { fighterAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type MoveBody = {
  fromNominationId: string;
  toNominationId: string;
};

/** POST /api/admin/fighters/[id]/move — перевод бойца между номинациями (только admin). */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: MoveBody;
  try {
    body = (await req.json()) as MoveBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.fromNominationId || !body?.toNominationId) {
    return NextResponse.json(
      { error: "fromNominationId and toNominationId are required" },
      { status: 400 },
    );
  }

  try {
    const res = await fighterAdminClient.moveFighter(
      {
        fighterId: id,
        fromNominationId: body.fromNominationId,
        toNominationId: body.toNominationId,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: fighterToJson(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}
