// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeSkeleton } from "./home-skeleton";

describe("widgets/home HomeSkeleton (spec 0034, NFR-5)", () => {
  afterEach(cleanup);

  it("renders skeleton placeholders, not a spinner or a loading text", () => {
    const { container } = render(<HomeSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-slot="skeleton-card"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-slot="skeleton-row"]').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Загрузка/i)).not.toBeInTheDocument();
    expect(container.querySelector('[role="status"]')).not.toBeInTheDocument();
  });
});
