/**
 * isActiveNavItem — определяет, активен ли пункт навигации для текущего пути.
 *
 * Однoсегментные href'ы (`/`, `/admin`) — это index-роуты, у которых есть
 * соседние под-разделы (`/admin/tournament`, ...). Их нельзя матчить по
 * префиксу, иначе index-пункт «проглотит» подсветку соседей. Многосегментные
 * href'ы (`/admin/tournament`) матчатся и по префиксу — для их собственных
 * вложенных путей.
 */
export function isActiveNavItem(pathname: string, href: string): boolean {
  if (href.startsWith("#")) return false;
  if (pathname === href) return true;

  const segments = href.split("/").filter(Boolean);
  if (segments.length <= 1) return false;

  return pathname.startsWith(`${href}/`);
}
