import { describe, expect, it } from "vitest";
import { refreshDecision } from "./session-refresh";

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
