import { describe, expect, it } from "vitest";
import { UnauthorizedError, ensureAuthorized } from "./unauthorized";

describe("ensureAuthorized", () => {
  it("throws UnauthorizedError on a 401 response", () => {
    const res = new Response(null, { status: 401 });
    expect(() => ensureAuthorized(res)).toThrow(UnauthorizedError);
  });

  it("does not throw on a successful response", () => {
    const res = new Response(null, { status: 200 });
    expect(() => ensureAuthorized(res)).not.toThrow();
  });

  it("does not throw on other error statuses (e.g. 500)", () => {
    const res = new Response(null, { status: 500 });
    expect(() => ensureAuthorized(res)).not.toThrow();
  });
});
