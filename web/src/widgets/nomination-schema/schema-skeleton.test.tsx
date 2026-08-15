// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SchemaSkeleton } from "./schema-skeleton";

afterEach(() => {
  cleanup();
});

describe("SchemaSkeleton (спека 0031, FR-28, AC-19)", () => {
  it("renders a skeleton (not a loading text) shaped like palette + two level rows", () => {
    render(<SchemaSkeleton />);
    expect(screen.getByTestId("schema-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("schema-skeleton-palette")).toBeInTheDocument();
    expect(screen.getAllByTestId("schema-skeleton-level")).toHaveLength(2);
    expect(screen.queryByText(/загруз/i)).not.toBeInTheDocument();
  });
});
