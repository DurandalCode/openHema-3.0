import { describe, expect, it } from "vitest";
import { clampPage, pageSlice, paginationWindow } from "./paginate";

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

// Спека 0024 (FR-23): клиентская пагинация над уже загруженным списком.
describe("pageSlice", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  it("returns the first page", () => {
    expect(pageSlice(items, 1, 3)).toEqual([1, 2, 3]);
  });

  it("returns the last, partial page", () => {
    expect(pageSlice(items, 3, 3)).toEqual([7]);
  });

  it("returns an empty array for an empty list", () => {
    expect(pageSlice([], 1, 3)).toEqual([]);
  });

  it("returns an empty array for a page number out of range", () => {
    expect(pageSlice(items, 5, 3)).toEqual([]);
    expect(pageSlice(items, 0, 3)).toEqual([]);
  });
});

describe("clampPage", () => {
  it("keeps an in-range page unchanged", () => {
    expect(clampPage(2, 5)).toBe(2);
  });

  it("clamps a page above the page count down to the last page", () => {
    expect(clampPage(99, 5)).toBe(5);
  });

  it("clamps a page below 1 up to 1", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-3, 5)).toBe(1);
  });

  it("clamps to 1 when there are no pages", () => {
    expect(clampPage(1, 0)).toBe(1);
  });
});
