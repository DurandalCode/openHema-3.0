// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileNav } from "./mobile-nav";
import type { NavItem } from "@/shared/config/site-config";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const items: NavItem[] = [
  { title: "Сейчас", href: "/#arenas-now" },
  { title: "Номинации", href: "/#nominations-rail" },
  { title: "О турнире", href: "/about" },
  { title: "Кабинет", href: "/dashboard" },
];

describe("MobileNav (spec 0039, T17)", () => {
  afterEach(() => {
    pathname = "/";
    cleanup();
  });

  it("renders the same items as the wide menu (AC-7)", () => {
    render(<MobileNav items={items} />);
    for (const item of items) {
      expect(screen.getByRole("link", { name: new RegExp(item.title) })).toHaveAttribute(
        "href",
        item.href,
      );
    }
  });

  it("marks the active item with aria-current (AC-7)", () => {
    pathname = "/about";
    render(<MobileNav items={items} />);
    expect(screen.getByRole("link", { name: /О турнире/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Кабинет/ })).not.toHaveAttribute("aria-current");
  });

  it("does not render on /admin/** routes (AC-8)", () => {
    pathname = "/admin/tournament";
    const { container } = render(<MobileNav items={items} />);
    expect(container).toBeEmptyDOMElement();
  });
});
