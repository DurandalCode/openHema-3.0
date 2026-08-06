import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { bracketToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

type SeedBody = {
  fighterId: string;
  slot: number;
};

type ClearBody = {
  slot: number;
};

/**
 * POST /api/stages/[stageId]/seed — DnD: посеять бойца в слот сетки (спека
 * 0018, FR-7/FR-8). Занятый слот — обмен местами для уже посеянного бойца,
 * `ErrSlotOccupied` (→ 409) для нового.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  let body: SeedBody;
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.fighterId) {
    return NextResponse.json({ error: "fighterId is required" }, { status: 400 });
  }
  if (typeof body?.slot !== "number") {
    return NextResponse.json({ error: "slot is required" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.seedBracketSlot(
      { stageId, slot: body.slot, fighterId: body.fighterId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ bracket: bracketToJson(res.bracket) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DELETE /api/stages/[stageId]/seed — освободить слот сетки: боец
 * возвращается в нераспределённые (FR-8, undoable).
 */
export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  let body: ClearBody;
  try {
    body = (await req.json()) as ClearBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body?.slot !== "number") {
    return NextResponse.json({ error: "slot is required" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.clearBracketSlot(
      { stageId, slot: body.slot },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ bracket: bracketToJson(res.bracket) });
  } catch (err) {
    return errorResponse(err);
  }
}
