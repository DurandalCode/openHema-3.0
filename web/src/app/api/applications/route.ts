import { NextResponse, type NextRequest } from "next/server";
import { applicationClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { applicationsToJson, applicationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type SubmitBody = {
  nominationId: string;
};

/** GET /api/applications — заявки текущего пользователя («мои заявки»). */
export async function GET(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await applicationClient.listMyApplications(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ applications: applicationsToJson(res.applications) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/applications — подать заявку в номинацию (текущий пользователь). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.nominationId) {
    return NextResponse.json({ error: "nominationId is required" }, { status: 400 });
  }

  try {
    const res = await applicationClient.submitApplication(
      { nominationId: body.nominationId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ application: applicationToJson(res.application) });
  } catch (err) {
    return errorResponse(err);
  }
}
