import { describe, expect, it } from "vitest";
import { paginationWindow } from "./paginate";

describe("paginationWindow (FR-10)", () => {
  it("returns every page without ellipsis when the list is short", () => {
    expect(paginationWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("collapses the far side into a single ellipsis when only one gap exists", () => {
    expect(paginationWindow(2, 10)).toEqual([1, 2, 3, "ellipsis", 10]);
  });

  it("collapses both sides into ellipses when the current page is in the middle", () => {
    expect(paginationWindow(5, 10)).toEqual([
      1,
      "ellipsis",
      4,
      5,
      6,
      "ellipsis",
      10,
    ]);
  });

  it("handles the first-page boundary", () => {
    expect(paginationWindow(1, 10)).toEqual([1, 2, "ellipsis", 10]);
  });

  it("handles the last-page boundary", () => {
    expect(paginationWindow(10, 10)).toEqual([1, "ellipsis", 9, 10]);
  });

  it("returns a single page for pageCount === 1", () => {
    expect(paginationWindow(1, 1)).toEqual([1]);
  });

  it("returns an empty window for pageCount <= 0", () => {
    expect(paginationWindow(1, 0)).toEqual([]);
  });

  it("clamps an out-of-range page into the valid range", () => {
    expect(paginationWindow(99, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationWindow(0, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
