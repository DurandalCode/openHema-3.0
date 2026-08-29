import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken } from "@/lib/session/cookies";
import { userToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/**
 * POST /api/auth/email/change — запрос смены адреса учётки (спека 0042,
 * FR-6). Требует access-cookie и текущий пароль; сервер отправляет письмо
 * подтверждения на новый адрес и предупреждение — на прежний (FR-7).
 * Прежний адрес учётки не меняется до перехода по ссылке — ответ несёт
 * `pending_email`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let newEmail: string;
  let currentPassword: string;
  try {
    ({ newEmail, currentPassword } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const res = await authClient.requestEmailChange(
      { newEmail, currentPassword },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ user: userToJson(res.user) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DELETE /api/auth/email/change — отмена незавершённого запроса смены
 * адреса (спека 0042, FR-6). Требует access-cookie.
 */
export async function DELETE(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await authClient.cancelEmailChange(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return NextResponse.json({ user: userToJson(res.user) });
  } catch (err) {
    return errorResponse(err);
  }
}
