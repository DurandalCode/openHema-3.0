import { describe, expect, it } from "vitest";
import { mergeRequestCookieHeader, refreshDecision, shouldAutoRefreshPath } from "./session-refresh";

describe("refreshDecision", () => {
  it("skips when access cookie is present, regardless of refresh cookie", () => {
    expect(refreshDecision({ hasAccess: true, hasRefresh: true })).toBe("skip");
    expect(refreshDecision({ hasAccess: true, hasRefresh: false })).toBe("skip");
  });

  it("treats a visitor without either cookie as a plain guest", () => {
    expect(refreshDecision({ hasAccess: false, hasRefresh: false })).toBe("guest");
  });

  it("attempts refresh when access is gone but refresh is still present", () => {
    expect(refreshDecision({ hasAccess: false, hasRefresh: true })).toBe("refresh");
  });
});

describe("mergeRequestCookieHeader", () => {
  it("adds a fresh cookie value from a Set-Cookie header onto an empty request", () => {
    const merged = mergeRequestCookieHeader("", ["hema_access=newtoken; Path=/; HttpOnly"]);
    expect(merged).toBe("hema_access=newtoken");
  });

  it("replaces an existing cookie value with the refreshed one (same request sees the new token)", () => {
    const merged = mergeRequestCookieHeader("hema_access=old; hema_refresh=r1", [
      "hema_access=fresh; Path=/; HttpOnly; Max-Age=900",
    ]);
    expect(merged).toBe("hema_access=fresh; hema_refresh=r1");
  });

  it("adds a cookie that was missing from the request entirely (access was gone, now issued)", () => {
    const merged = mergeRequestCookieHeader("hema_refresh=r1", [
      "hema_access=fresh; Path=/",
      "hema_refresh=r2; Path=/",
    ]);
    expect(merged).toBe("hema_refresh=r2; hema_access=fresh");
  });

  it("ignores malformed Set-Cookie entries without an '=' instead of throwing", () => {
    const merged = mergeRequestCookieHeader("hema_access=old", ["garbage-no-equals"]);
    expect(merged).toBe("hema_access=old");
  });
});

describe("shouldAutoRefreshPath", () => {
  // Головной случай: middleware сам зовёт эту ручку, и без исключения
  // внутренний fetch рекурсивно попал бы в тот же middleware.
  it("refuses /api/auth/refresh — otherwise the middleware calls itself", () => {
    expect(shouldAutoRefreshPath("/api/auth/refresh")).toBe(false);
  });

  // Эти пять ручек сами пишут пару cookie; порядок слияния двух наборов
  // Set-Cookie Next не документирует. Для logout это критично: победи
  // Set-Cookie от middleware — выход бы не сработал.
  it("refuses the cookie-mutating auth routes", () => {
    expect(shouldAutoRefreshPath("/api/auth/login")).toBe(false);
    expect(shouldAutoRefreshPath("/api/auth/register")).toBe(false);
    expect(shouldAutoRefreshPath("/api/auth/logout")).toBe(false);
    expect(shouldAutoRefreshPath("/api/auth/password")).toBe(false);
  });

  it("allows the arena BFF routes the console hammers for hours", () => {
    expect(shouldAutoRefreshPath("/api/arenas/a1/timer-frame")).toBe(true);
    expect(shouldAutoRefreshPath("/api/arenas/a1/timer")).toBe(true);
    expect(shouldAutoRefreshPath("/api/arenas/a1/board")).toBe(true);
  });

  it("allows SSE relays — a reconnect then carries a fresh cookie", () => {
    expect(shouldAutoRefreshPath("/api/arenas/a1/live")).toBe(true);
    expect(shouldAutoRefreshPath("/api/tournaments/t1/console/stream")).toBe(true);
    expect(shouldAutoRefreshPath("/api/tournament/live")).toBe(true);
  });

  it("allows read-only auth routes", () => {
    expect(shouldAutoRefreshPath("/api/auth/me")).toBe(true);
    expect(shouldAutoRefreshPath("/api/auth/sessions")).toBe(true);
    expect(shouldAutoRefreshPath("/api/auth/sessions/s1")).toBe(true);
  });

  it("allows plain pages", () => {
    expect(shouldAutoRefreshPath("/")).toBe(true);
    expect(shouldAutoRefreshPath("/dashboard")).toBe(true);
    expect(shouldAutoRefreshPath("/admin/arenas/a1")).toBe(true);
  });

  // Сравнение по полному пути, а не startsWith — иначе будущая ручка
  // «/api/auth/logout-all» молча потеряла бы продление.
  it("does not confuse a prefix with the whole path", () => {
    expect(shouldAutoRefreshPath("/api/auth/refresh-token")).toBe(true);
    expect(shouldAutoRefreshPath("/api/auth/logout-all")).toBe(true);
  });

  it("ignores a trailing slash", () => {
    expect(shouldAutoRefreshPath("/api/auth/refresh/")).toBe(false);
  });
});
