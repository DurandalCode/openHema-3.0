import { NextResponse, type NextRequest } from "next/server";
import { arenaAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { arenaToJson, arenasToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type CreateBody = {
  tournamentId: string;
  name: string;
  description?: string;
};

/** GET /api/admin/arenas?tournamentId=... — список площадок турнира (только admin). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const tournamentId = req.nextUrl.searchParams.get("tournamentId") ?? undefined;

  try {
    const res = await arenaAdminClient.listArenas(
      { tournamentId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ arenas: arenasToJson(res.arenas) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/admin/arenas — создание площадки турнира (только admin). */
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
    const res = await arenaAdminClient.createArena(
      {
        tournamentId: body.tournamentId,
        name: body.name,
        description: body.description ?? "",
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ arena: arenaToJson(res.arena) });
  } catch (err) {
    return errorResponse(err);
  }
}