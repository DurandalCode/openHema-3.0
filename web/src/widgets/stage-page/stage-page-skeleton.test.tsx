// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StagePageSkeleton } from "./stage-page-skeleton";

afterEach(() => {
  cleanup();
});

describe("StagePageSkeleton (спека 0032, FR-26, AC-15)", () => {
  it("renders a skeleton shaped like the page frame: header, summary cards, body + rail", () => {
    render(<StagePageSkeleton />);
    expect(screen.getByTestId("stage-page-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("stage-page-skeleton-header")).toBeInTheDocument();
    expect(screen.getByTestId("stage-page-skeleton-cards")).toBeInTheDocument();
    expect(screen.getByTestId("stage-page-skeleton-body")).toBeInTheDocument();
    expect(screen.getByTestId("stage-page-skeleton-rail")).toBeInTheDocument();
  });

  it("does not render a loading text", () => {
    render(<StagePageSkeleton />);
    expect(screen.queryByText(/загруз/i)).not.toBeInTheDocument();
  });
});
