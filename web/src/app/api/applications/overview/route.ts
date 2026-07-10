import { NextResponse, type NextRequest } from "next/server";
import { applicationAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { applicationsToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { ApplicationState } from "@/gen/hema/v1/application_pb";

export const runtime = "nodejs";

const STATUS_VALUES = new Set(Object.values(ApplicationState).filter(
  (v): v is ApplicationState => typeof v === "number",
));

/**
 * GET /api/applications/overview?tournamentId=...&status=...&nominationId=...
 * — сводный экран заявок турнира (admin) с лёгкой фильтрацией по статусу и/или
 * номинации (FR-14). Оба фильтра опциональны и комбинируются.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const tournamentId = req.nextUrl.searchParams.get("tournamentId");
  if (!tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  let status: ApplicationState | undefined;
  if (statusParam) {
    const parsed = Number(statusParam);
    if (!STATUS_VALUES.has(parsed)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    status = parsed;
  }

  const nominationId = req.nextUrl.searchParams.get("nominationId") ?? undefined;

  try {
    const res = await applicationAdminClient.listApplications(
      { tournamentId, status, nominationId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ applications: applicationsToJson(res.applications) });
  } catch (err) {
    return errorResponse(err);
  }
}
