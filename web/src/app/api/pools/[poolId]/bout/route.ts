import { NextResponse, type NextRequest } from "next/server";
import { poolAdminClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { boutBoardToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ poolId: string }> };

type BoutAction = "start" | "score" | "finish" | "reopen" | "reset";

type BoutActionBody = {
  action?: string;
  scoreA?: number;
  scoreB?: number;
};

const ACTIONS: readonly BoutAction[] = ["start", "score", "finish", "reopen", "reset"];

function isBoutAction(value: string | undefined): value is BoutAction {
  return !!value && (ACTIONS as readonly string[]).includes(value);
}

/**
 * POST /api/pools/[poolId]/bout — ведение текущего боя пула (спека 0013):
 * одна ручка, действие передаётся в теле (`action`), диспатчится на
 * соответствующий RPC. `score` — абсолютное значение счёта (быстрые шаги
 * ±1/±2/±3/±5 и ручной ввод считаются на клиенте, FR-2/FR-2a). Только admin.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { poolId } = await ctx.params;

  let body: BoutActionBody;
  try {
    body = (await req.json()) as BoutActionBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!isBoutAction(body?.action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const authHeaders = { headers: { Authorization: `Bearer ${accessToken}` } };

  try {
    switch (body.action) {
      case "start": {
        const res = await poolAdminClient.startCurrentBout({ poolId }, authHeaders);
        return NextResponse.json({ board: boutBoardToJson(res.board) });
      }
      case "score": {
        if (typeof body.scoreA !== "number" || typeof body.scoreB !== "number") {
          return NextResponse.json(
            { error: "scoreA and scoreB are required" },
            { status: 400 },
          );
        }
        const res = await poolAdminClient.scoreCurrentBout(
          { poolId, scoreA: body.scoreA, scoreB: body.scoreB },
          authHeaders,
        );
        return NextResponse.json({ board: boutBoardToJson(res.board) });
      }
      case "finish": {
        const res = await poolAdminClient.finishCurrentBout({ poolId }, authHeaders);
        return NextResponse.json({ board: boutBoardToJson(res.board) });
      }
      case "reopen": {
        const res = await poolAdminClient.reopenCurrentBout({ poolId }, authHeaders);
        return NextResponse.json({ board: boutBoardToJson(res.board) });
      }
      case "reset": {
        const res = await poolAdminClient.resetCurrentBout({ poolId }, authHeaders);
        return NextResponse.json({ board: boutBoardToJson(res.board) });
      }
    }
  } catch (err) {
    return errorResponse(err);
  }
}
