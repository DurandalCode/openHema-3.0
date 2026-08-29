import { NextResponse } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken, getRefreshToken } from "@/lib/session/cookies";
import { sessionToJson } from "@/lib/grpc/serialize";

export const runtime = "nodejs";

/**
 * GET /api/auth/sessions — список активных сессий текущего пользователя
 * (спека 0042, FR-11). `ListSessions` определяет «текущую» сессию по
 * заголовку `X-Refresh-Token` (сам refresh-токен, не access) —
 * `server/modules/auth/api/handler.go`, `currentSessionHeader`. Без него
 * сервер не сможет отметить `current: true` ни у одной сессии.
 */
export async function GET(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const refreshToken = await getRefreshToken();

  try {
    const res = await authClient.listSessions(
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Refresh-Token": refreshToken ?? "",
        },
      },
    );
    return NextResponse.json({ sessions: res.sessions.map(sessionToJson) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * DELETE /api/auth/sessions — «выйти со всех устройств» (спека 0042,
 * FR-12): завершает все сессии, кроме текущей. Тот же заголовок
 * `X-Refresh-Token`, что и `GET` — иначе `RevokeOtherSessions` не сможет
 * исключить текущую сессию из отзыва.
 */
export async function DELETE(): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const refreshToken = await getRefreshToken();

  try {
    const res = await authClient.revokeOtherSessions(
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Refresh-Token": refreshToken ?? "",
        },
      },
    );
    return NextResponse.json({ revokedCount: res.revokedCount });
  } catch (err) {
    return errorResponse(err);
  }
}
