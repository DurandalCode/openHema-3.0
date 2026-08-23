/**
 * Список защищённых маршрутов — единственный источник истины для
 * `SessionExpiredDialog` (спека 0038, FR-17: «На главную» vs «Продолжить как
 * гость»). Реальная защита живёт в каждой странице отдельно (`getCurrentUser()`
 * + `redirect("/login")` в `app/dashboard/page.tsx`, `app/applications/page.tsx`,
 * `app/nominations/[id]/apply/page.tsx`, `app/(admin)/layout.tsx`) — Next.js
 * App Router не даёт единого места, откуда эту защиту можно вывести
 * автоматически. Этот список — вручную поддерживаемое зеркало: **любая новая
 * страница с таким же guard'ом обязана добавить свой префикс сюда**, иначе
 * диалог истёкшей сессии ошибочно сочтёт её публичной.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/applications", "/admin"];
const NOMINATION_APPLY_RE = /^\/nominations\/[^/]+\/apply(\/|$)/;

export function isProtectedRoute(pathname: string): boolean {
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return NOMINATION_APPLY_RE.test(pathname);
}
