// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminNavLinks } from "./admin-nav-links";

let pathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// Перенос и расширение бывшего admin-nav.test.tsx (T14, спека 0022):
// `usePathname` — client-only хук, поэтому тестируем клиентский под-компонент
// `AdminNavLinks`, а не серверный `AdminShell` (который его использует).

describe("AdminNavLinks", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a link to the format presets library (спека 0020, FR-12)", () => {
    render(<AdminNavLinks />);
    expect(screen.getByRole("link", { name: "Форматы" })).toHaveAttribute(
      "href",
      "/admin/formats",
    );
  });

  it("marks the formats link active on /admin/formats", () => {
    pathname = "/admin/formats";
    render(<AdminNavLinks />);
    expect(screen.getByRole("link", { name: "Форматы" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Номинации" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("does not render the phantom 'Пульт' item from the default design (AC-4)", () => {
    pathname = "/admin";
    render(<AdminNavLinks />);
    expect(screen.queryByRole("link", { name: "Пульт" })).toBeNull();
  });

  it("does not render '+ Создать админа' — creation moved into a modal on the users screen (спека 0024, AC-12)", () => {
    pathname = "/admin";
    render(<AdminNavLinks />);
    expect(
      screen.queryByRole("link", { name: "+ Создать админа" }),
    ).toBeNull();
  });
});
