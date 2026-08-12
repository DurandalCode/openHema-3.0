// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

describe("Pagination (AC-10, NFR-3)", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks the current page with aria-current", () => {
    render(<Pagination page={2} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "3" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("disables the 'back' control on the first page", () => {
    render(<Pagination page={1} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Вперёд" })).not.toBeDisabled();
  });

  it("disables the 'forward' control on the last page", () => {
    render(<Pagination page={5} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Вперёд" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Назад" })).not.toBeDisabled();
  });

  it("calls onPageChange when a page number is clicked (AC-10)", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageCount={5} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with the next/previous page for arrow controls", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={5} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("is marked as navigation with an accessible label", () => {
    render(<Pagination page={1} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "aria-label",
      "Пагинация",
    );
  });

  it("renders nothing interactive-breaking when there is only one page", () => {
    render(<Pagination page={1} pageCount={1} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Вперёд" })).toBeDisabled();
  });
});
