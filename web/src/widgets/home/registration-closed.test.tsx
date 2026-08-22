// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RegistrationClosed } from "./registration-closed";

describe("widgets/home RegistrationClosed (spec 0034, FR-21)", () => {
  afterEach(cleanup);

  it("shows the closed-registration message", () => {
    render(<RegistrationClosed isAuthenticated={false} />);
    expect(screen.getByText("Приём заявок завершён")).toBeInTheDocument();
  });

  it('shows a link to "Мои заявки" for an authenticated user', () => {
    render(<RegistrationClosed isAuthenticated={true} />);
    expect(screen.getByRole("link", { name: "Мои заявки" })).toHaveAttribute(
      "href",
      "/applications",
    );
  });

  it("hides the link for a guest", () => {
    render(<RegistrationClosed isAuthenticated={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
