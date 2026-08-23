import { NextResponse, type NextRequest } from "next/server";
import { mergeRequestCookieHeader, refreshDecision } from "@/shared/lib/session-refresh";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  SESSION_EXPIRED_COOKIE,
} from "@/shared/config/session-cookies";

// Имена — из `shared/config/session-cookies.ts` (общие с `lib/session/
// cookies.ts` и `SessionExpiredDialog`). Сами значения cookie и их
// httpOnly/secure/maxAge-опции здесь не ставятся — куки по-прежнему кладёт
// `POST /api/auth/refresh` штатным `setSessionCookies`.
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
 *
 * Свежие cookie накладываются на заголовок `Cookie` ТЕКУЩЕГО запроса через
 * `NextResponse.next({ request })` — не только в ответ браузеру. Без этого
 * downstream Server Component того же запроса (`getCurrentUser()` в
 * `app/dashboard/page.tsx`) читает исходный `Cookie` без свежего access и
 * успевает `redirect("/login")` раньше, чем браузер применит новые cookie
 * со следующей навигации — продление стало бы формально успешным, но всё
 * равно на секунду выкидывало бы на `/login` (найдено ручной проверкой T25,
 * `mergeRequestCookieHeader` — её юнит-тест).
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

  const setCookieHeaders = refreshResponse.headers.getSetCookie();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(
    "cookie",
    mergeRequestCookieHeader(req.headers.get("cookie") ?? "", setCookieHeaders),
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of setCookieHeaders) {
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
