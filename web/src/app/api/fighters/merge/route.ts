import { NextResponse, type NextRequest } from "next/server";
import { fighterAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { toFighterDto } from "../to-fighter-dto";

export const runtime = "nodejs";

type MergeBody = {
  sourceFighterId: string;
  targetFighterId: string;
};

/**
 * POST /api/fighters/merge — слияние дубля `sourceFighterId` в
 * `targetFighterId` (admin, спека 0040, FR-10/FR-10a): участия и результаты
 * source переносятся на target, source помечается объединённым
 * (`FIGHTER_STATUS_MERGED`), не удаляется физически. Необратимое действие —
 * подтверждение на UI (`ConfirmDialog`, `features/fighter-management`), эта
 * ручка его не запрашивает повторно.
 *
 * `sourceFighterId === targetFighterId` отклоняется здесь же (400), не
 * доходя до RPC — тот же случай, что доменная `ErrSameFighter`, но дешевле
 * поймать раньше.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: MergeBody;
  try {
    body = (await req.json()) as MergeBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const sourceFighterId = body?.sourceFighterId?.trim();
  const targetFighterId = body?.targetFighterId?.trim();
  if (!sourceFighterId || !targetFighterId) {
    return NextResponse.json(
      { error: "sourceFighterId and targetFighterId are required" },
      { status: 400 },
    );
  }
  if (sourceFighterId === targetFighterId) {
    return NextResponse.json(
      { error: "cannot merge a fighter with itself" },
      { status: 400 },
    );
  }

  try {
    const res = await fighterAdminClient.mergeFighters(
      { sourceFighterId, targetFighterId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ fighter: toFighterDto(res.fighter) });
  } catch (err) {
    return errorResponse(err);
  }
}
