import { NextResponse, type NextRequest } from "next/server";
import { nominationAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { nominationsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type ReorderBody = {
  tournamentId: string;
  orderedIds: string[];
};

/** POST /api/nominations/reorder — порядок номинаций турнира (только admin). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: ReorderBody;
  try {
    body = (await req.json()) as ReorderBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
  }
  if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds is required" }, { status: 400 });
  }

  try {
    const res = await nominationAdminClient.reorderNominations(
      { tournamentId: body.tournamentId, orderedIds: body.orderedIds },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ nominations: nominationsToJson(res.nominations) });
  } catch (err) {
    return errorResponse(err);
  }
}
