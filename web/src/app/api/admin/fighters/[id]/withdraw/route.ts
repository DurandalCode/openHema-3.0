import { NextResponse, type NextRequest } from "next/server";
import { WithdrawalReason } from "@/gen/hema/v1/fighter_pb";
import { fighterAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { WithdrawalReason as WithdrawalReasonDto } from "@/entities/fighter/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type WithdrawBody = {
  reason: WithdrawalReasonDto;
};

const REASON_DTO_TO_PROTO: Partial<Record<WithdrawalReasonDto, WithdrawalReason>> = {
  WITHDRAWAL_REASON_INJURY: WithdrawalReason.INJURY,
  WITHDRAWAL_REASON_BAN: WithdrawalReason.BAN,
  WITHDRAWAL_REASON_OTHER: WithdrawalReason.OTHER,
};

/** POST /api/admin/fighters/[id]/withdraw — вывод бойца с турнира (только admin). */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: WithdrawBody;
  try {
    body = (await req.json()) as WithdrawBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const reason = REASON_DTO_TO_PROTO[body?.reason];
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  try {
    const res = await fighterAdminClient.withdrawFighter(
      { fighterId: id, reason },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: fighterToJson(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}
