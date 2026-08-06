import { NextResponse, type NextRequest } from "next/server";
import { stageAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { PoolLayoutStatus } from "@/gen/hema/v1/stage_pb";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ stageId: string }> };

type SetStatusBody = {
  status: "draft" | "ready";
};

const statusMap: Record<SetStatusBody["status"], PoolLayoutStatus> = {
  draft: PoolLayoutStatus.DRAFT,
  ready: PoolLayoutStatus.READY,
};

/**
 * POST /api/stages/[stageId]/status — переключить статус состава этапа
 * draft↔ready (FR-9/FR-18): у сетки фиксация также материализует круги/бои
 * (FR-3, гейт «меньше двух посеянных» — `ErrNotEnoughSeeds`, AC-4).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { stageId } = await ctx.params;

  let body: SetStatusBody;
  try {
    body = (await req.json()) as SetStatusBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const status = statusMap[body?.status];
  if (status === undefined) {
    return NextResponse.json({ error: "status must be 'draft' or 'ready'" }, { status: 400 });
  }

  try {
    const res = await stageAdminClient.setLayoutStatus(
      { stageId, status },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ layout: poolLayoutToJson(res.layout) });
  } catch (err) {
    return errorResponse(err);
  }
}
