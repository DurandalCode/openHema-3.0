// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TableScroll } from "./table-scroll";

afterEach(() => {
  cleanup();
});

describe("TableScroll (spec 0044, FR-8/AC-3)", () => {
  it("renders children", () => {
    render(
      <TableScroll>
        <div>Содержимое таблицы</div>
      </TableScroll>,
    );

    expect(screen.getByText("Содержимое таблицы")).toBeInTheDocument();
  });

  it("scrolls horizontally in its own container instead of the page", () => {
    render(
      <TableScroll>
        <div>Содержимое таблицы</div>
      </TableScroll>,
    );

    const container = document.querySelector('[data-slot="table-scroll"]');
    expect(container).toBeInTheDocument();
    expect(container?.className).toMatch(/(?:^|\s)overflow-x-auto(?:\s|$)/);
  });

  it("merges a custom className with the base classes", () => {
    render(
      <TableScroll className="rounded-lg">
        <div>Содержимое таблицы</div>
      </TableScroll>,
    );

    const container = document.querySelector('[data-slot="table-scroll"]');
    expect(container?.className).toMatch(/(?:^|\s)overflow-x-auto(?:\s|$)/);
    expect(container?.className).toMatch(/(?:^|\s)rounded-lg(?:\s|$)/);
  });
});
