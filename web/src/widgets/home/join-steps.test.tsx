// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JoinSteps } from "./join-steps";

describe("widgets/home JoinSteps (spec 0034, FR-9)", () => {
  afterEach(cleanup);

  it("renders the three static steps", () => {
    render(<JoinSteps isAuthenticated={false} />);
    expect(screen.getByText("Создайте аккаунт")).toBeInTheDocument();
    expect(screen.getByText("Подайте заявку в номинацию")).toBeInTheDocument();
    expect(screen.getByText("Оплатите и зарегистрируйтесь")).toBeInTheDocument();
  });

  it('links "Мои заявки" to /login for a guest', () => {
    render(<JoinSteps isAuthenticated={false} />);
    expect(screen.getByRole("link", { name: "Мои заявки" })).toHaveAttribute("href", "/login");
  });

  it('links "Мои заявки" to /applications for an authenticated user', () => {
    render(<JoinSteps isAuthenticated={true} />);
    expect(screen.getByRole("link", { name: "Мои заявки" })).toHaveAttribute(
      "href",
      "/applications",
    );
  });
});
