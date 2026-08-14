// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UnsavedChangesBar } from "./unsaved-changes-bar";

afterEach(() => {
  cleanup();
});

describe("UnsavedChangesBar (spec 0029, FR-7, AC-4)", () => {
  it("lists the changed fields and explains when they reach the homepage", () => {
    render(<UnsavedChangesBar changes={["название", "дата начала", "1 контакт"]} />);

    expect(screen.getByText(/название, дата начала, 1 контакт/)).toBeInTheDocument();
    expect(screen.getByText(/появятся на главной/)).toBeInTheDocument();
    expect(screen.getByText(/после сохранения/)).toBeInTheDocument();
  });

  it("does not render when there are no changes (AC-5)", () => {
    const { container } = render(<UnsavedChangesBar changes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
