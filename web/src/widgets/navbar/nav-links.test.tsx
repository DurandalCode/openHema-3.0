// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavLinks } from "./nav-links";
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

describe("NavLinks (spec 0039, T16)", () => {
  afterEach(() => {
    pathname = "/";
    cleanup();
  });

  it("renders exactly the items it is given", () => {
    render(<NavLinks items={items} />);
    for (const item of items) {
      expect(screen.getByRole("link", { name: item.title })).toHaveAttribute("href", item.href);
    }
  });

  it("highlights the active route item", () => {
    pathname = "/about";
    render(<NavLinks items={items} />);
    expect(screen.getByRole("link", { name: "О турнире" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Сейчас" })).not.toHaveAttribute("aria-current");
  });

  it("never highlights anchor items (no scrollspy)", () => {
    pathname = "/";
    render(<NavLinks items={items} />);
    expect(screen.getByRole("link", { name: "Сейчас" })).not.toHaveAttribute("aria-current");
  });

  it("hides itself entirely on admin routes", () => {
    pathname = "/admin/tournament";
    render(<NavLinks items={items} />);
    expect(screen.queryByRole("link", { name: "Сейчас" })).toBeNull();
  });
});
