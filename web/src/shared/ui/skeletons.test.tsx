// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkeletonCards, SkeletonRows } from "./skeletons";

describe("Skeletons (FR-1)", () => {
  afterEach(() => {
    cleanup();
  });

  it("SkeletonRows renders the given number of rows and columns", () => {
    const { container } = render(<SkeletonRows rows={4} cols={3} />);

    const rows = container.querySelectorAll("[data-slot='skeleton-row']");
    expect(rows).toHaveLength(4);

    rows.forEach((row) => {
      expect(row.querySelectorAll("[data-slot='skeleton']")).toHaveLength(3);
    });
  });

  it("SkeletonRows uses sensible defaults when rows/cols are omitted", () => {
    const { container } = render(<SkeletonRows />);
    expect(
      container.querySelectorAll("[data-slot='skeleton-row']").length,
    ).toBeGreaterThan(0);
  });

  it("SkeletonCards renders the given number of cards", () => {
    const { container } = render(<SkeletonCards count={5} />);
    expect(
      container.querySelectorAll("[data-slot='skeleton-card']"),
    ).toHaveLength(5);
  });
});
