// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsSection } from "./notifications-section";

afterEach(() => {
  cleanup();
});

describe("NotificationsSection (spec 0042, T40, FR-19/FR-22)", () => {
  it("renders both toggles, off by default", () => {
    render(
      <NotificationsSection
        value={{ applicationState: false, poolSeated: false }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "Уведомлять о состоянии заявок" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Уведомлять о постановке пула на площадку" }),
    ).not.toBeChecked();
  });

  it("reflects a checked state from props", () => {
    render(
      <NotificationsSection
        value={{ applicationState: true, poolSeated: false }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "Уведомлять о состоянии заявок" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Уведомлять о постановке пула на площадку" }),
    ).not.toBeChecked();
  });

  it("clicking the application-state toggle calls onChange, preserving the other field", () => {
    const onChange = vi.fn();
    render(
      <NotificationsSection
        value={{ applicationState: false, poolSeated: true }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Уведомлять о состоянии заявок" }));

    expect(onChange).toHaveBeenCalledWith({ applicationState: true, poolSeated: true });
  });

  it("clicking the pool-seated toggle calls onChange, preserving the other field", () => {
    const onChange = vi.fn();
    render(
      <NotificationsSection
        value={{ applicationState: true, poolSeated: false }}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Уведомлять о постановке пула на площадку" }),
    );

    expect(onChange).toHaveBeenCalledWith({ applicationState: true, poolSeated: true });
  });

  it("explains that the global toggle only permits, it does not opt users in (FR-22)", () => {
    render(
      <NotificationsSection
        value={{ applicationState: false, poolSeated: false }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getAllByText(/уходит только тем, кто лично включил этот вид у себя/i),
    ).toHaveLength(2);
  });
});
