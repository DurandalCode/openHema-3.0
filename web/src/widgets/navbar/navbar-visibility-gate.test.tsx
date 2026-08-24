// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavbarVisibilityGate } from "./navbar-visibility-gate";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

afterEach(() => {
  cleanup();
});

describe("widgets/navbar/NavbarVisibilityGate", () => {
  it("renders children on a public route", () => {
    pathname = "/dashboard";
    render(
      <NavbarVisibilityGate>
        <div data-testid="navbar-stub">navbar</div>
      </NavbarVisibilityGate>,
    );

    expect(screen.getByTestId("navbar-stub")).toBeInTheDocument();
  });

  it("hides children on /admin and its sub-routes — AdminShell already renders a full topbar there", () => {
    pathname = "/admin/tournament";
    render(
      <NavbarVisibilityGate>
        <div data-testid="navbar-stub">navbar</div>
      </NavbarVisibilityGate>,
    );

    expect(screen.queryByTestId("navbar-stub")).not.toBeInTheDocument();
  });

  it("hides children on the /admin index route too", () => {
    pathname = "/admin";
    render(
      <NavbarVisibilityGate>
        <div data-testid="navbar-stub">navbar</div>
      </NavbarVisibilityGate>,
    );

    expect(screen.queryByTestId("navbar-stub")).not.toBeInTheDocument();
  });
});
