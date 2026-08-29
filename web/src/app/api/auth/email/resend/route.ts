import { NextResponse } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

/**
 * POST /api/auth/email/resend — повторная отправка письма подтверждения
 * (спека 0042, FR-4). Требует access-cookie (действие принадлежит текущей
 * учётке). Троттлинг (не чаще 1/мин на адрес) — на сервере, отклонение
 * приходит как `ErrThrottled` → `CodeResourceExhausted` → 429.
 */
export async function POST(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    await authClient.resendEmailVerification(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
