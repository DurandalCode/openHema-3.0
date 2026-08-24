// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RegulationsLink } from "./regulations-link";

describe("entities/tournament/ui RegulationsLink (spec 0038 T13 FR-45, moved by spec 0039 T2)", () => {
  afterEach(cleanup);

  it("renders a link to the regulations opening in a new tab", () => {
    render(<RegulationsLink url="https://example.com/rules.pdf" />);
    const link = screen.getByRole("link", { name: /Регламент турнира/ });
    expect(link).toHaveAttribute("href", "https://example.com/rules.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders nothing when the url is empty", () => {
    const { container } = render(<RegulationsLink url="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
