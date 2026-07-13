import { NextResponse, type NextRequest } from "next/server";
import { fighterAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { fightersToJson, fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type CreateBody = {
  tournamentId: string;
  name: string;
  club?: string;
  nominationIds?: string[];
};

/** GET /api/admin/fighters?tournamentId=... — ростер турнира (только admin). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const tournamentId = req.nextUrl.searchParams.get("tournamentId") ?? undefined;

  try {
    const res = await fighterAdminClient.listRoster(
      { tournamentId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighters: fightersToJson(res.fighters) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/admin/fighters — ручное заведение бойца (только admin). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
  }
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const res = await fighterAdminClient.createFighter(
      {
        tournamentId: body.tournamentId,
        name: body.name,
        club: body.club ?? "",
        nominationIds: body.nominationIds ?? [],
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: fighterToJson(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}
