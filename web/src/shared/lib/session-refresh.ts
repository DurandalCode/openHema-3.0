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
