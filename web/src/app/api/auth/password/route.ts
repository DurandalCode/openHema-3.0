import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import { getAccessToken, getRefreshToken, setSessionCookies } from "@/lib/session/cookies";

export const runtime = "nodejs";

/**
 * POST /api/auth/password — смена пароля залогиненным пользователем (spec
 * 0037, FR-9/FR-12). `ChangePassword` возвращает новую пару токенов — их
 * **обязательно** класть в cookie тем же приёмом, что `login`/`register`:
 * иначе собственная сессия пользователя обрывается на следующем `refresh`
 * (старый refresh-токен инвалидируется сменой пароля).
 *
 * `ChangePassword` завершает все сессии пользователя, кроме той, из
 * которой её сделали (спека 0042, FR-14) — сервер узнаёт «текущую» сессию
 * по заголовку `X-Refresh-Token` (сам refresh-токен, не access), тем же
 * приёмом, что `ListSessions`/`RevokeOtherSessions`
 * (`server/modules/auth/api/handler.go`, `currentSessionHeader`). Без
 * заголовка сервер не сможет исключить текущую сессию из отзыва.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const refreshToken = await getRefreshToken();

  let currentPassword: string;
  let newPassword: string;
  try {
    ({ currentPassword, newPassword } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const res = await authClient.changePassword(
      { currentPassword, newPassword },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Refresh-Token": refreshToken ?? "",
        },
      },
    );

    if (res.tokens) {
      await setSessionCookies(res.tokens.accessToken, res.tokens.refreshToken);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
