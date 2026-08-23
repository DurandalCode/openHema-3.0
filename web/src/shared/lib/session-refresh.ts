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
