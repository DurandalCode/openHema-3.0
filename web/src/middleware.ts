import { NextResponse, type NextRequest } from "next/server";
import {
  mergeRequestCookieHeader,
  refreshDecision,
  shouldAutoRefreshPath,
} from "@/shared/lib/session-refresh";
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

// Всё, кроме статики и путей с расширением. `/api/*` СПЕЦИАЛЬНО включён:
// долгоживущие экраны (консоль арены, табло) висят на одном URL часами и не
// делают ни одной навигации — без продления на их запросах к BFF access-кука
// протухала через 15 минут прямо посреди турнира.
//
// Точный список исключений внутри `/api` — `shouldAutoRefreshPath`, а не эта
// строка: Next требует, чтобы matcher был литералом (анализируется на
// билде), то есть тестом он не покрывается, а рекурсия на
// `/api/auth/refresh` — самая дорогая ошибка здесь. Matcher остаётся грубым
// фильтром производительности.
//
// Оговорка: `.*\..*` продолжает исключать любой путь с точкой. Под
// `app/api` таких сегодня нет, но ручка вида `/api/files/report.csv` молча
// выпала бы из продления.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
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
  if (!shouldAutoRefreshPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

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
    // Сеть/апстрим недоступны — это НЕ «сессия истекла». Раньше такой блип
    // стирал refresh-куку; на частоте «раз в навигацию» это было терпимо, на
    // 5 запросах в секунду — по-настоящему разлогинивает секретаря посреди
    // турнира. Оставляем куки как есть, попробуем на следующем запросе.
    return NextResponse.next();
  }

  // Гасим сессию ТОЛЬКО на 401: refresh-токен действительно мёртв (отозван,
  // протух, старше PasswordChangedAt) — повторять бессмысленно, и ветка
  // самоограничивается: следующий запрос пойдёт как «гость». Любой другой
  // не-ok (5xx при рестарте Go-сервера) — транзиентный, куки не трогаем.
  // Сознательная ревизия NFR-5 спеки 0038: «без повторов внутри одного
  // запроса» сохраняется, но транзиентный отказ больше не сжигает сессию.
  if (refreshResponse.status === 401) {
    return sessionExpiredResponse();
  }
  if (!refreshResponse.ok) {
    return NextResponse.next();
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
