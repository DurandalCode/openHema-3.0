/**
 * Имена cookie сессии — единственный источник истины для всех трёх мест,
 * которым нужно совпадающее имя без совпадающего рантайма: `lib/session/
 * cookies.ts` (Node, `next/headers`, ставит/читает httpOnly access/refresh),
 * `middleware.ts` (Edge, `NextRequest`/`NextResponse.cookies`, не может
 * импортировать `next/headers`) и `widgets/session-expired/
 * session-expired-dialog.tsx` (браузер, `document.cookie`). Голые строковые
 * константы без побочных импортов — безопасны для всех трёх.
 */

export const ACCESS_COOKIE = "hema_access";
export const REFRESH_COOKIE = "hema_refresh";

// Короткоживущая, НЕ httpOnly метка (спека 0038, FR-15): middleware её
// ставит при неудачном автопродлении, `SessionExpiredDialog` читает через
// `document.cookie` и сразу гасит.
export const SESSION_EXPIRED_COOKIE = "hema_session_expired";
