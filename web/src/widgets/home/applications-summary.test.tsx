// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationsSummarySection } from "./applications-summary";
import type { ApplicationsSummary } from "@/entities/application/lib/summary";

describe("widgets/home ApplicationsSummarySection (spec 0034, FR-5)", () => {
  afterEach(cleanup);

  it("renders nothing when there is nothing to summarize", () => {
    const summary: ApplicationsSummary = { applied: 0, confirmed: 0, capacity: null };
    const { container } = render(<ApplicationsSummarySection summary={summary} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows applied/confirmed/capacity tiles when capacity is set", () => {
    const summary: ApplicationsSummary = { applied: 42, confirmed: 30, capacity: 96 };
    render(<ApplicationsSummarySection summary={summary} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
  });

  it("hides the capacity tile when capacity is null but still shows applied/confirmed", () => {
    const summary: ApplicationsSummary = { applied: 5, confirmed: 1, capacity: null };
    render(<ApplicationsSummarySection summary={summary} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("Мест всего")).not.toBeInTheDocument();
  });

  it("renders when only capacity is set (applied/confirmed both zero)", () => {
    const summary: ApplicationsSummary = { applied: 0, confirmed: 0, capacity: 10 };
    const { container } = render(<ApplicationsSummarySection summary={summary} />);
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
