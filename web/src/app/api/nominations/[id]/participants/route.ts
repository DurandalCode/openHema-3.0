import { NextResponse, type NextRequest } from "next/server";
import { applicationPublicClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { nominationParticipantsToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/participants — публичный стартовый лист
 * номинации: имена заявленных/подтверждённых бойцов и счётчики
 * («заявлено · подтверждено / лимит», FR-15/FR-16). Не требует access-токена.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const res = await applicationPublicClient.listNominationParticipants({
      nominationId: id,
    });
    return NextResponse.json({
      participants: nominationParticipantsToJson(res.participants),
      appliedCount: res.appliedCount,
      confirmedCount: res.confirmedCount,
      fighterCapacity: res.fighterCapacity ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
