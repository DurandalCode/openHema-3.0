// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Breadcrumbs } from "./breadcrumbs";

describe("Breadcrumbs (FR-11)", () => {
  afterEach(() => {
    cleanup();
  });

  const items = [
    { label: "Турнир", href: "/tournaments/1" },
    { label: "Номинация", href: "/tournaments/1/nominations/2" },
    { label: "Этап", href: "/tournaments/1/nominations/2/stages/3" },
    { label: "Пул" },
  ];

  it("renders every level but the last as a link", () => {
    render(<Breadcrumbs items={items} />);

    expect(screen.getByRole("link", { name: "Турнир" })).toHaveAttribute(
      "href",
      "/tournaments/1",
    );
    expect(screen.getByRole("link", { name: "Номинация" })).toHaveAttribute(
      "href",
      "/tournaments/1/nominations/2",
    );
    expect(screen.getByRole("link", { name: "Этап" })).toHaveAttribute(
      "href",
      "/tournaments/1/nominations/2/stages/3",
    );
  });

  it("renders the last item as non-link text with aria-current='page'", () => {
    render(<Breadcrumbs items={items} />);

    expect(screen.queryByRole("link", { name: "Пул" })).toBeNull();
    const current = screen.getByText("Пул");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("is marked as navigation with an accessible label", () => {
    render(<Breadcrumbs items={items} />);
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "aria-label",
      "Хлебные крошки",
    );
  });
});
