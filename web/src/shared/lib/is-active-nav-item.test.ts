import { describe, expect, it } from "vitest";
import { isActiveNavItem } from "./is-active-nav-item";

describe("isActiveNavItem", () => {
  it("matches exact pathname", () => {
    expect(isActiveNavItem("/about", "/about")).toBe(true);
  });

  it("does not match unrelated pathname", () => {
    expect(isActiveNavItem("/dashboard", "/about")).toBe(false);
  });

  it("highlights a specific admin sub-route, not the index route", () => {
    expect(isActiveNavItem("/admin/tournament", "/admin/tournament")).toBe(true);
    expect(isActiveNavItem("/admin/tournament", "/admin")).toBe(false);
  });

  it("does not let the admin index route swallow sibling sub-routes", () => {
    expect(isActiveNavItem("/admin/nominations", "/admin")).toBe(false);
    expect(isActiveNavItem("/admin", "/admin")).toBe(true);
  });

  it("matches nested paths under a multi-segment route", () => {
    expect(isActiveNavItem("/admin/tournament/foo", "/admin/tournament")).toBe(true);
  });

  it("treats hash anchors as never active by pathname", () => {
    expect(isActiveNavItem("/", "/#tournament")).toBe(false);
    expect(isActiveNavItem("/about", "/#tournament")).toBe(false);
  });

  it("treats home route as exact-only", () => {
    expect(isActiveNavItem("/", "/")).toBe(true);
    expect(isActiveNavItem("/about", "/")).toBe(false);
  });
});
