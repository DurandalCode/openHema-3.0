// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TableRow } from "./table-row";

afterEach(() => {
  cleanup();
});

describe("TableRow", () => {
  it("renders cell text", () => {
    render(<TableRow cells={[{ text: "Иванов", tone: "strong" }]} />);

    expect(screen.getByText("Иванов")).toBeInTheDocument();
  });

  it("strikes cell text when strike + state=out", () => {
    render(
      <TableRow cells={[{ text: "Петров", strike: true }]} state="out" />
    );

    expect(screen.getByText("Петров")).toHaveClass("line-through");
  });

  it("does not strike cell text when strike but state=default", () => {
    render(
      <TableRow
        cells={[{ text: "Сидоров", strike: true }]}
        state="default"
      />
    );

    expect(screen.getByText("Сидоров")).not.toHaveClass("line-through");
  });

  it("colors cell text by tone=red with destructive token class", () => {
    render(<TableRow cells={[{ text: "Дисквалифицирован", tone: "red" }]} />);

    expect(screen.getByText("Дисквалифицирован")).toHaveClass(
      "text-destructive"
    );
  });

  it("highlights the row differently when selected vs default", () => {
    const { container: defaultContainer } = render(
      <TableRow cells={[{ text: "A" }]} state="default" />
    );
    const defaultRoot = defaultContainer.firstElementChild as HTMLElement;
    cleanup();

    const { container: selectedContainer } = render(
      <TableRow cells={[{ text: "A" }]} state="selected" />
    );
    const selectedRoot = selectedContainer.firstElementChild as HTMLElement;

    expect(selectedRoot.className).not.toBe(defaultRoot.className);
  });
});
