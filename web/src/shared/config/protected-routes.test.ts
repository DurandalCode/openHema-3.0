import { describe, expect, it } from "vitest";
import { isProtectedRoute } from "./protected-routes";

describe("isProtectedRoute", () => {
  it("treats the dashboard as protected", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
  });

  it("treats the applications list as protected", () => {
    expect(isProtectedRoute("/applications")).toBe(true);
  });

  it("treats the admin section (and its sub-routes) as protected — app/(admin)/layout.tsx redirects unauthenticated visitors too", () => {
    expect(isProtectedRoute("/admin")).toBe(true);
    expect(isProtectedRoute("/admin/tournament")).toBe(true);
  });

  it("treats a nomination's apply page as protected, but not the nomination page itself", () => {
    expect(isProtectedRoute("/nominations/n1/apply")).toBe(true);
    expect(isProtectedRoute("/nominations/n1")).toBe(false);
  });

  it("treats the public home and about pages as not protected", () => {
    expect(isProtectedRoute("/")).toBe(false);
    expect(isProtectedRoute("/about")).toBe(false);
    expect(isProtectedRoute("/nominations/n1")).toBe(false);
  });
});
