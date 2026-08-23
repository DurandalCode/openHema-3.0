import { describe, expect, it } from "vitest";
import { mergeRequestCookieHeader, refreshDecision } from "./session-refresh";

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
