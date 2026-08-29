import { NextResponse } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { clearSessionCookies, getRefreshToken } from "@/lib/session/cookies";

export const runtime = "nodejs";

/**
 * POST /api/auth/logout — выход из системы (спека 0042, FR-13). Сначала
 * завершает текущую сессию **на сервере** (`Logout`, определяет сессию по
 * клейму `sid` в самом refresh-токене — не по заголовку), затем чистит
 * cookie. RPC-ошибка намеренно проглочена: выход обязан быть идемпотентным
 * — просроченный/уже отозванный/отсутствующий refresh-токен не должен
 * мешать браузеру завершить локальную сессию.
 */
export async function POST(): Promise<NextResponse> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await authClient.logout({ refreshToken });
    } catch {
      // Намеренно проглочено: logout всегда успешен для браузера (FR-13).
    }
  }

  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
