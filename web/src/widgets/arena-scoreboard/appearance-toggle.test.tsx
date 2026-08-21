// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceToggle } from "./appearance-toggle";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AppearanceToggle (spec 0033, FR-31/AC-18)", () => {
  it("defaults to dark — button offers switching to light", () => {
    render(<AppearanceToggle arenaId="arena-1" />);
    const button = screen.getByRole("button", { name: /светлое/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("data-appearance", "dark");
  });

  it("clicking toggles to light and persists to localStorage under the per-arena key", () => {
    render(<AppearanceToggle arenaId="arena-1" />);
    fireEvent.click(screen.getByRole("button", { name: /светлое/i }));

    const button = screen.getByRole("button", { name: /тёмное/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-appearance", "light");
    expect(window.localStorage.getItem("scoreboard-appearance:arena-1")).toBe("light");
  });

  it("clicking twice returns to dark", () => {
    render(<AppearanceToggle arenaId="arena-1" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveAttribute("data-appearance", "dark");
    expect(window.localStorage.getItem("scoreboard-appearance:arena-1")).toBe("dark");
  });

  it("remembers the choice for this arena across remounts (AC-18)", () => {
    const { unmount } = render(<AppearanceToggle arenaId="arena-1" />);
    fireEvent.click(screen.getByRole("button"));
    unmount();

    render(<AppearanceToggle arenaId="arena-1" />);
    expect(screen.getByRole("button")).toHaveAttribute("data-appearance", "light");
  });

  it("keeps preferences isolated per arena", () => {
    window.localStorage.setItem("scoreboard-appearance:arena-1", "light");
    render(<AppearanceToggle arenaId="arena-2" />);
    expect(screen.getByRole("button")).toHaveAttribute("data-appearance", "dark");
  });

  it("is keyboard-accessible: a real <button> with an aria-pressed state, not a div", () => {
    render(<AppearanceToggle arenaId="arena-1" />);
    const button = screen.getByRole("button");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });
});
