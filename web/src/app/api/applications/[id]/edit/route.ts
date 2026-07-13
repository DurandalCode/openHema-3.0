import { NextResponse, type NextRequest } from "next/server";
import { applicationAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { applicationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { ApplicationState } from "@/gen/hema/v1/application_pb";
import type { ApplicationState as ApplicationStateDto } from "@/entities/application/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type EditBody = {
  club?: string;
  needsEquipment?: boolean;
  applicantNameOverride?: string;
  nominationId?: string;
  state?: ApplicationStateDto;
};

const STATE_DTO_TO_PROTO: Partial<Record<ApplicationStateDto, ApplicationState>> = {
  APPLICATION_STATE_SUBMITTED: ApplicationState.SUBMITTED,
  APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION: ApplicationState.AWAITING_PAYMENT_CONFIRMATION,
  APPLICATION_STATE_PAID: ApplicationState.PAID,
  APPLICATION_STATE_REGISTERED: ApplicationState.REGISTERED,
  APPLICATION_STATE_WITHDRAWN: ApplicationState.WITHDRAWN,
};

/**
 * POST /api/applications/[id]/edit — правка заявки (admin): клуб, признак
 * экипировки, переопределение имени, перенос номинации и/или ручная смена
 * статуса (спека 0006, FR-3..FR-9). Допустимо над заявкой в любом состоянии.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: EditBody;
  try {
    body = (await req.json()) as EditBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  let state: ApplicationState | undefined;
  if (body.state !== undefined) {
    const mapped = STATE_DTO_TO_PROTO[body.state];
    if (mapped === undefined) {
      return NextResponse.json({ error: "invalid state" }, { status: 400 });
    }
    state = mapped;
  }

  try {
    const res = await applicationAdminClient.editApplication(
      {
        applicationId: id,
        club: body.club ?? "",
        needsEquipment: body.needsEquipment ?? false,
        applicantNameOverride: body.applicantNameOverride ?? "",
        nominationId: body.nominationId,
        state,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ application: applicationToJson(res.application) });
  } catch (err) {
    return errorResponse(err);
  }
}
