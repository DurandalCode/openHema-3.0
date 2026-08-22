import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";

export const runtime = "nodejs";

/**
 * POST /api/auth/password-reset — запрос восстановления доступа (spec 0037,
 * FR-1/FR-2). Ответ всегда `200 {ok:true}`, независимо от того, существует
 * ли аккаунт, дошло ли письмо или упал ли сам RPC: по ответу нельзя
 * проверить существование адреса (FR-2), а сбой отправки не должен читаться
 * иначе, чем успех (NFR-2). Поэтому — в отличие от остальных auth-ручек —
 * здесь нет `errorResponse`: любая ошибка транспорта тоже тонет в {ok:true}.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ok = NextResponse.json({ ok: true });

  let email: string;
  try {
    ({ email } = await req.json());
  } catch {
    return ok;
  }

  try {
    await authClient.requestPasswordReset({ email });
  } catch {
    // Намеренно проглочено: NFR-2 — сбой отправки/RPC не меняет ответ.
  }

  return ok;
}
