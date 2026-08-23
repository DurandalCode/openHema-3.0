import { NextResponse, type NextRequest } from "next/server";
import { refreshDecision } from "@/shared/lib/session-refresh";

// Совпадают с ACCESS_COOKIE/REFRESH_COOKIE (`lib/session/cookies.ts`). Не
// импортируются оттуда напрямую: тот модуль тянет `next/headers`, чей
// `cookies()` рассчитан на Server Component/Route Handler контекст, не на
// Middleware (здесь штатный способ — `NextRequest`/`NextResponse.cookies`).
// Сами значения и их httpOnly/secure/maxAge-опции не дублируются — куки
// по-прежнему ставит `POST /api/auth/refresh` штатным `setSessionCookies`.
const ACCESS_COOKIE = "hema_access";
const REFRESH_COOKIE = "hema_refresh";

// Короткоживущая, НЕ httpOnly метка — читается клиентским кодом
// (`session-expired-store`, спека 0038 FR-15), чтобы поднять диалог «Сессия
// истекла» сразу на первой отрисовке после неудачного продления.
const SESSION_EXPIRED_COOKIE = "hema_session_expired";
const SESSION_EXPIRED_MAX_AGE = 30;

// Все страницы, кроме статики/картинок/файлов с расширением и `/api/*` —
// иначе внутренний fetch на `/api/auth/refresh` ниже рекурсивно попадал бы
// в этот же middleware.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/).*)"],
};

/**
 * middleware — автопродление сессии (спека 0038, FR-14/NFR-5). На каждую
 * навигацию: если access-cookie жива — ничего не делает; если нет ни
 * access, ни refresh — гость, тоже ничего не делает; если access истёк, а
 * refresh ещё жив — один внутренний вызов `/api/auth/refresh` (та же ручка,
 * что обслуживает явный вызов с клиента), результат которого либо продлевает
 * пару cookie, либо гасит protected refresh и оставляет читаемую клиентом
 * метку истечения. Повторов нет (NFR-5): при неудаче refresh-cookie
 * удаляется, следующая навигация идёт уже веткой «гость».
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const decision = refreshDecision({
    hasAccess: req.cookies.has(ACCESS_COOKIE),
    hasRefresh: req.cookies.has(REFRESH_COOKIE),
  });

  if (decision !== "refresh") {
    return NextResponse.next();
  }

  let refreshResponse: Response;
  try {
    refreshResponse = await fetch(new URL("/api/auth/refresh", req.nextUrl.origin), {
      method: "POST",
      headers: { cookie: req.headers.get("cookie") ?? "" },
    });
  } catch {
    return sessionExpiredResponse();
  }

  if (!refreshResponse.ok) {
    return sessionExpiredResponse();
  }

  const response = NextResponse.next();
  for (const cookie of refreshResponse.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

function sessionExpiredResponse(): NextResponse {
  const response = NextResponse.next();
  response.cookies.delete(REFRESH_COOKIE);
  response.cookies.set(SESSION_EXPIRED_COOKIE, "1", {
    path: "/",
    maxAge: SESSION_EXPIRED_MAX_AGE,
  });
  return response;
}
