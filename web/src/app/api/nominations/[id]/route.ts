import { Code, ConnectError } from "@connectrpc/connect";
import { NextResponse, type NextRequest } from "next/server";
import { nominationAdminClient, nominationClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { nominationToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type UpdateBody = {
  title: string;
  description?: string;
  fighterCapacity?: number | null;
  metadata?: { rulesUrl?: string };
};

/** GET /api/nominations/[id] — одна номинация (публичный). */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    const res = await nominationClient.getNomination({ id });
    return NextResponse.json({ nomination: nominationToJson(res.nomination) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/nominations/[id] — обновление номинации (только admin). */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.title || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const fighterCapacity =
    typeof body.fighterCapacity === "number" ? body.fighterCapacity : undefined;
  const rulesUrl = body.metadata?.rulesUrl;

  try {
    const res = await nominationAdminClient.updateNomination(
      {
        id,
        title: body.title,
        description: body.description ?? "",
        fighterCapacity,
        metadata: rulesUrl ? { rulesUrl } : {},
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ nomination: nominationToJson(res.nomination) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/nominations/[id] — удаление номинации (только admin). */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    await nominationAdminClient.deleteNomination(
      { id },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return deleteErrorResponse(err);
  }
}

// Гейт на удаление номинации (спека 0040, FR-1/FR-2/AC-1/AC-2): сервер
// различает два отказа одним и тем же `connect.CodeFailedPrecondition`, по
// тексту (тот же приём, что уже применялся в 0036 для дублей заявки —
// `web/src/app/api/applications/route.ts`, только там коды различались, а
// здесь код один и тот же — различитель именно текст). BFF не пробрасывает
// сырой Go-текст (`err.rawMessage`) наружу для этих двух причин, а отдаёт
// машиночитаемый код — UI (`nominations-screen.tsx`) переводит его в
// человекочитаемую причину. Строки-маркеры зафиксированы в
// `docs/specs/0040-domain-gaps/plan.md` («modules/nomination») как
// источник истины и должны совпасть с `nomination.ErrHasDistributedFighters`/
// `ErrHasBouts` серверного трека.
const HAS_DISTRIBUTED_FIGHTERS_MESSAGE = "nomination: has distributed fighters";
const HAS_BOUTS_MESSAGE = "nomination: has bouts";

function deleteErrorResponse(err: unknown): NextResponse {
  if (err instanceof ConnectError && err.code === Code.FailedPrecondition) {
    if (err.rawMessage === HAS_DISTRIBUTED_FIGHTERS_MESSAGE) {
      return NextResponse.json({ error: "has_distributed_fighters" }, { status: 409 });
    }
    if (err.rawMessage === HAS_BOUTS_MESSAGE) {
      return NextResponse.json({ error: "has_bouts" }, { status: 409 });
    }
  }
  return errorResponse(err);
}
