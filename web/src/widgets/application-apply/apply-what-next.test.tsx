// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApplyWhatNext } from "./apply-what-next";
import { applicationFunnel } from "@/entities/application/lib/state";

afterEach(() => {
  cleanup();
});

describe("widgets/application-apply ApplyWhatNext", () => {
  it("lists the four funnel steps in order (FR-4)", () => {
    render(<ApplyWhatNext />);

    const steps = applicationFunnel().map((s) => s.label);
    const rendered = screen.getAllByRole("listitem").map((el) => el.textContent);

    expect(rendered.length).toBe(steps.length);
    steps.forEach((label, i) => {
      expect(rendered[i]).toContain(label);
    });
  });

  it("states the withdrawal rule — allowed up to registration", () => {
    render(<ApplyWhatNext />);

    expect(screen.getByText(/отозвать.*до регистрации/i)).toBeInTheDocument();
  });
});
