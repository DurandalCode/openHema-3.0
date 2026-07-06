import { NextResponse } from "next/server";
import { authClient } from "@/lib/grpc/client";
import { errorResponse } from "@/lib/grpc/errors";
import {
  getRefreshToken,
  setSessionCookies,
} from "@/lib/session/cookies";

export const runtime = "nodejs";

/** POST /api/auth/refresh — обновление пары токенов по refresh-cookie. */
export async function POST(): Promise<NextResponse> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const res = await authClient.refresh({ refreshToken });
    if (res.tokens) {
      await setSessionCookies(res.tokens.accessToken, res.tokens.refreshToken);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
