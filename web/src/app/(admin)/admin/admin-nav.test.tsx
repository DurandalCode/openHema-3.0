// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminNav } from "./admin-nav";

let pathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

describe("AdminNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a link to the format presets library (спека 0020, FR-12)", () => {
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Форматы" })).toHaveAttribute(
      "href",
      "/admin/formats",
    );
  });

  it("marks the formats link active on /admin/formats", () => {
    pathname = "/admin/formats";
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Форматы" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Номинации" })).not.toHaveAttribute("aria-current");
  });
});
