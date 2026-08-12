// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePagination } from "./use-pagination";

describe("usePagination (FR-10)", () => {
  it("slices items into pages of the given size", () => {
    const items = Array.from({ length: 10 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagination(items, 3));

    expect(result.current.pageCount).toBe(4);
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toEqual([1, 2, 3]);
  });

  it("returns a partial last page", () => {
    const items = Array.from({ length: 10 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagination(items, 3));

    act(() => {
      result.current.setPage(4);
    });

    expect(result.current.page).toBe(4);
    expect(result.current.pageItems).toEqual([10]);
  });

  it("resets the current page when the list shrinks below it", () => {
    let items = Array.from({ length: 20 }, (_, i) => i + 1);
    const { result, rerender } = renderHook(
      ({ items }) => usePagination(items, 5),
      { initialProps: { items } },
    );

    act(() => {
      result.current.setPage(4);
    });
    expect(result.current.page).toBe(4);

    items = Array.from({ length: 5 }, (_, i) => i + 1);
    rerender({ items });

    expect(result.current.pageCount).toBe(1);
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toEqual([1, 2, 3, 4, 5]);
  });

  it("clamps pageCount to at least 1 for an empty list", () => {
    const { result } = renderHook(() => usePagination([], 5));

    expect(result.current.pageCount).toBe(1);
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toEqual([]);
  });
});
