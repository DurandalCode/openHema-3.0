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
    if (!res.tokens) {
      // По контракту Service.Refresh успех всегда несёт пару токенов, так
      // что пустой tokens — сломанный апстрим, а НЕ мёртвая сессия. Отвечаем
      // 502, а не 401: на 401 middleware гасит живую refresh-куку. Раньше
      // здесь молча возвращался 200 {ok:true} без обновления cookie, и
      // вызывающий считал протухшую сессию продлённой.
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    await setSessionCookies(res.tokens.accessToken, res.tokens.refreshToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
