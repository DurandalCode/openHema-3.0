import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { PoolLayoutStatus } from "@/gen/hema/v1/pool_pb";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type SetStatusBody = {
  status: "draft" | "ready";
};

const statusMap: Record<SetStatusBody["status"], PoolLayoutStatus> = {
  draft: PoolLayoutStatus.DRAFT,
  ready: PoolLayoutStatus.READY,
};

/**
 * GET /api/nominations/[id]/pool-status — тонкий срез раскладки для списка
 * номинаций: только `status` + `canUndo` (без пулов/бойцов, чтобы не тянуть
 * лишний payload). Маппит на тот же gRPC `GetLayout` и обрезает на BFF.
 * Только admin (требует access-токен; pool-layout — служебный).
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const res = await poolAdminClient.getLayout(
      { nominationId: id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const layout = poolLayoutToJson(res.layout);
    return NextResponse.json({
      status: layout?.status ?? "POOL_LAYOUT_STATUS_UNSPECIFIED",
      canUndo: layout?.canUndo ?? false,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/nominations/[id]/pool-status — переключить статус раскладки
 * draft↔ready (FR-9).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

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
    const res = await poolAdminClient.setLayoutStatus(
      { nominationId: id, status },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ layout: poolLayoutToJson(res.layout) });
  } catch (err) {
    return errorResponse(err);
  }
}