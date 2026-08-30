// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminNavDrawer } from "./admin-nav-drawer";
import { ADMIN_NAV_ITEMS } from "./admin-nav-links";

let pathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют полифиллов pointer-capture/
 * scrollIntoView (см. `shared/ui/dialog.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  pathname = "/admin";
  cleanup();
});

describe("AdminNavDrawer (spec 0044, FR-6/AC-4)", () => {
  it("opens the panel with every ADMIN_NAV_ITEMS entry on trigger click", () => {
    render(<AdminNavDrawer />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /меню/i }));

    const dialog = screen.getByRole("dialog");
    for (const item of ADMIN_NAV_ITEMS) {
      expect(
        screen.getByRole("link", { name: new RegExp(item.title) }),
      ).toHaveAttribute("href", item.href);
    }
    expect(dialog).toBeInTheDocument();
  });

  it("marks the active item with aria-current", () => {
    pathname = "/admin/fighters";
    render(<AdminNavDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /меню/i }));

    expect(screen.getByRole("link", { name: /Бойцы/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Пульт/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("closes when a nav item is selected", () => {
    render(<AdminNavDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /меню/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /Бойцы/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<AdminNavDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /меню/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
