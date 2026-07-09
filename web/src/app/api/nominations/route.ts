import { NextResponse, type NextRequest } from "next/server";
import { nominationAdminClient, nominationClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { nominationToJson, nominationsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type CreateBody = {
  tournamentId: string;
  title: string;
  description?: string;
  fighterCapacity?: number | null;
  metadata?: { rulesUrl?: string };
};

/** GET /api/nominations?tournamentId=... — номинации турнира (публичный). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tournamentId = req.nextUrl.searchParams.get("tournamentId");
  if (!tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
  }

  try {
    const res = await nominationClient.listNominations({ tournamentId });
    return NextResponse.json({ nominations: nominationsToJson(res.nominations) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/nominations — создание номинации турнира (только admin). */
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
  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const fighterCapacity =
    typeof body.fighterCapacity === "number" ? body.fighterCapacity : undefined;
  const rulesUrl = body.metadata?.rulesUrl;

  try {
    const res = await nominationAdminClient.createNomination(
      {
        tournamentId: body.tournamentId,
        title: body.title,
        description: body.description ?? "",
        fighterCapacity,
        metadata: rulesUrl ? { rulesUrl } : {},
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ nomination: nominationToJson(res.nomination) });
  } catch (err) {
    return errorResponse(err);
  }
}
