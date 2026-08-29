import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/**
 * POST /api/auth/email/change/confirm — подтверждение смены адреса по
 * ссылке из письма, отправленного на новый адрес (спека 0042, FR-6).
 * Публичный: переход по ссылке может случиться без сессии текущего
 * браузера, как и `/api/auth/email/verify`. Ответ несёт обновлённого
 * `user`, но НЕ привязан к cookie-сессии этого запроса — публичный ответ
 * не раскрывает ничего сверх контракта RPC (NFR-2).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let token: string;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const res = await authClient.confirmEmailChange({ token });
    return NextResponse.json({ user: userToJson(res.user) });
  } catch (err) {
    return errorResponse(err);
  }
}
