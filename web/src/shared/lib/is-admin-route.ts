/**
 * isAdminRoute — проверяет, что путь принадлежит разделу `/admin` (сама
 * страница или любой её под-роут). Общий источник для мест, которым нужно
 * согласованно вести себя иначе в админ-зоне: `NavLinks` (прячет публичные
 * ссылки — там своя под-навигация, `AdminNavLinks`) и `NavbarVisibilityGate`
 * (прячет весь публичный `Navbar` целиком — у `/admin/**` есть собственная
 * полноценная шапка `AdminShell`, показывать обе разом означало бы дублировать
 * бренд и меню пользователя).
 *
 * Сегмент-осознанно, не голый `startsWith("/admin")` — тот совпал бы и с
 * гипотетическим `/administration`.
 */
export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
