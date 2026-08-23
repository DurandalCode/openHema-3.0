import { describe, expect, it } from "vitest";
import { isAdminRoute } from "./is-admin-route";

describe("isAdminRoute", () => {
  it("treats /admin and its sub-routes as admin territory", () => {
    expect(isAdminRoute("/admin")).toBe(true);
    expect(isAdminRoute("/admin/tournament")).toBe(true);
    expect(isAdminRoute("/admin/arenas/a1")).toBe(true);
  });

  it("does not treat public or unrelated routes as admin territory", () => {
    expect(isAdminRoute("/")).toBe(false);
    expect(isAdminRoute("/dashboard")).toBe(false);
    expect(isAdminRoute("/about")).toBe(false);
  });

  it("does not treat a route that merely starts with 'admin' as a segment prefix false-positive", () => {
    expect(isAdminRoute("/administration")).toBe(false);
  });
});
