import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";

export const runtime = "nodejs";

/**
 * POST /api/auth/email/verify — подтверждение адреса по ссылке из письма
 * (спека 0042, FR-3). Публичный: переход по ссылке может случиться в
 * браузере без сессии (другое устройство, письмо открыто отдельно) — не
 * требует access-cookie.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let token: string;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    await authClient.verifyEmail({ token });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
