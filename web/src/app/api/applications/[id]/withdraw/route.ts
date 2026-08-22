import { NextResponse, type NextRequest } from "next/server";
import { applicationClient } from "@/lib/grpc/client";
import { applicationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { applicationActionErrorResponse } from "../action-error";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/applications/[id]/withdraw — отозвать свою заявку. */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await applicationClient.withdrawApplication(
      { applicationId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ application: applicationToJson(res.application) });
  } catch (err) {
    return applicationActionErrorResponse(err, "withdraw");
  }
}
