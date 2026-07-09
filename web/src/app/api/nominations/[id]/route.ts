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
    return errorResponse(err);
  }
}
