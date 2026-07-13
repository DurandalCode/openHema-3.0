import { NextResponse, type NextRequest } from "next/server";
import { fighterPublicClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { rosterEntriesToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/nominations/[id]/roster — публичный состав номинации (бойцы, а
 * не заявки): имя, клуб, статус (в составе/выбыл). Отдельно от
 * /api/nominations/[id]/participants (воронка заявок, 0005) — спека 0007.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    const res = await fighterPublicClient.listNominationRoster({ nominationId: id });
    return NextResponse.json({ entries: rosterEntriesToJson(res.entries) });
  } catch (err) {
    return errorResponse(err);
  }
}
