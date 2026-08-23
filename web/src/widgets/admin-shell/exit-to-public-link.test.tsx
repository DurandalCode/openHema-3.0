// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExitToPublicLink } from "./exit-to-public-link";

afterEach(() => {
  cleanup();
});

describe("widgets/admin-shell/ExitToPublicLink", () => {
  it("links to the public home page", () => {
    render(<ExitToPublicLink />);

    expect(screen.getByRole("link", { name: /на сайт/i })).toHaveAttribute("href", "/");
  });
});
