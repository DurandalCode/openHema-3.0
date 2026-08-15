// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SchemaPalette } from "./schema-palette";

afterEach(() => {
  cleanup();
});

describe("SchemaPalette (спека 0031, FR-12)", () => {
  it("renders the three draggable sources: Ростер, Группы, Плейофф", () => {
    render(<SchemaPalette />);
    expect(screen.getByText("Ростер")).toBeInTheDocument();
    expect(screen.getByText("Группы")).toBeInTheDocument();
    expect(screen.getByText("Плейофф")).toBeInTheDocument();
  });

  it("shows a hint that dropping on a card sets the rule source", () => {
    render(<SchemaPalette />);
    expect(screen.getByText(/источник правила/i)).toBeInTheDocument();
  });
});
