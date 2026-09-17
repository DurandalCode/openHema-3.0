/**
 * refreshDecision — чистое решение о продлении сессии (спека 0038, FR-14/
 * FR-15): по наличию access/refresh cookie в запросе, без сети и без побочных
 * эффектов. `web/src/middleware.ts` — тонкая обёртка вокруг неё, сама делает
 * fetch и правит cookie; сетевая часть намеренно не тестируется здесь
 * (см. `plan.md`, «Риски»).
 */

export type SessionRefreshDecision = "skip" | "guest" | "refresh";

export function refreshDecision(input: {
  hasAccess: boolean;
  hasRefresh: boolean;
}): SessionRefreshDecision {
  if (input.hasAccess) return "skip";
  if (!input.hasRefresh) return "guest";
  return "refresh";
}

/**
 * NO_AUTO_REFRESH_PATHS — ручки BFF, на которых middleware НЕ продлевает
 * сессию. Список живёт здесь, а не в `config.matcher`: Next требует, чтобы
 * matcher был строковым литералом (он анализируется на билде), то есть
 * принципиально не покрывается тестом — а рекурсия на `/api/auth/refresh`
 * тут самая дорогая ошибка. Matcher остаётся грубым фильтром
 * производительности, точный список — эта функция.
 *
 * Почему именно эти пять: `auth/refresh` — рекурсия (middleware сам её
 * зовёт); остальные четыре сами пишут пару cookie через
 * `setSessionCookies`/`clearSessionCookies`, а порядок слияния двух наборов
 * `Set-Cookie` в одном ответе Next не документирует. Для `logout` это
 * критично: победи заголовок от middleware — выход бы не сработал, access
 * остался бы живым.
 */
const NO_AUTO_REFRESH_PATHS = new Set([
  "/api/auth/refresh",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/password",
]);

/**
 * shouldAutoRefreshPath — можно ли на этом пути автопродлевать сессию.
 * Сравнение по ПОЛНОМУ пути, не по префиксу: будущая ручка вроде
 * `/api/auth/logout-all` не должна молча потерять продление.
 */
export function shouldAutoRefreshPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return !NO_AUTO_REFRESH_PATHS.has(normalized);
}

/**
 * mergeRequestCookieHeader — применяет свежие `Set-Cookie` из ответа
 * `/api/auth/refresh` поверх заголовка `Cookie` ТЕКУЩЕГО запроса (спека
 * 0038, FR-14). Обязательно, а не косметика: middleware может переписать
 * cookie только в ОТВЕТЕ браузеру — на них он сориентируется со следующей
 * навигации. Downstream Server Components этого же запроса (напр.
 * `getCurrentUser()` в `app/dashboard/page.tsx`) читают исходный `Cookie`
 * запроса и без этой подмены увидели бы всё ещё просроченный/отсутствующий
 * access — из-за чего страница успевала redirect'нуть на `/login` раньше,
 * чем браузер применил бы новые cookie (найдено ручной проверкой T25, не
 * покрывается юнит-тестом `refreshDecision`).
 */
export function mergeRequestCookieHeader(
  existingCookieHeader: string,
  setCookieHeaders: string[],
): string {
  const cookies = new Map<string, string>();
  for (const pair of existingCookieHeader.split("; ").filter(Boolean)) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  for (const setCookie of setCookieHeaders) {
    const nameValue = setCookie.split(";", 1)[0];
    const eq = nameValue.indexOf("=");
    if (eq === -1) continue;
    cookies.set(nameValue.slice(0, eq), nameValue.slice(eq + 1));
  }
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}
