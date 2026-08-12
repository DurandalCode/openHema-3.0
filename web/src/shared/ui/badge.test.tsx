// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge tone mapping (спека 0022, T6)", () => {
  afterEach(() => {
    cleanup();
  });

  it("maps tone=live to the live color classes and renders a pulsing dot by default", () => {
    render(<Badge tone="live">В эфире</Badge>);
    const badge = screen.getByText("В эфире").closest("[data-slot='badge']");
    expect(badge).toHaveClass("bg-[#e9f7ef]");
    expect(badge).toHaveClass("border-[#bfe6cf]");
    expect(badge).toHaveClass("text-[#1a8f57]");
    expect(badge).toHaveClass("rounded-full");

    const dot = badge?.querySelector("[data-slot='badge-dot']");
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass("animate-pulse");
  });

  it("maps tone=danger to danger color classes without a dot or pulse", () => {
    render(<Badge tone="danger">Ошибка</Badge>);
    const badge = screen.getByText("Ошибка").closest("[data-slot='badge']");
    expect(badge).toHaveClass("bg-[#fdeceb]");
    expect(badge).toHaveClass("text-[#c0261a]");
    expect(badge).toHaveClass("rounded-md");
    expect(badge?.querySelector("[data-slot='badge-dot']")).toBeNull();
  });

  it("maps each remaining tone to its own color classes", () => {
    render(
      <>
        <Badge tone="success">Успех</Badge>
        <Badge tone="info">Инфо</Badge>
        <Badge tone="warn">Внимание</Badge>
        <Badge tone="neutral">Нейтрально</Badge>
      </>,
    );
    expect(
      screen.getByText("Успех").closest("[data-slot='badge']"),
    ).toHaveClass("bg-[#e9f7ef]");
    expect(
      screen.getByText("Инфо").closest("[data-slot='badge']"),
    ).toHaveClass("bg-[#eaf0fb]");
    expect(
      screen.getByText("Внимание").closest("[data-slot='badge']"),
    ).toHaveClass("bg-[#fdf1e0]");
    expect(
      screen.getByText("Нейтрально").closest("[data-slot='badge']"),
    ).toHaveClass("bg-[#f4f2ee]");
  });

  it("allows overriding the default dot visibility via the dot prop", () => {
    render(
      <Badge tone="success" dot>
        С точкой
      </Badge>,
    );
    const badge = screen.getByText("С точкой").closest("[data-slot='badge']");
    expect(badge?.querySelector("[data-slot='badge-dot']")).not.toBeNull();

    render(
      <Badge tone="live" dot={false}>
        Без точки
      </Badge>,
    );
    const noDotBadge = screen
      .getByText("Без точки")
      .closest("[data-slot='badge']");
    expect(noDotBadge?.querySelector("[data-slot='badge-dot']")).toBeNull();
  });

  it("keeps the existing variant-based rendering when tone is not passed (regression, AC-5)", () => {
    render(<Badge variant="secondary">Legacy</Badge>);
    const badge = screen.getByText("Legacy").closest("[data-slot='badge']");
    expect(badge).toHaveClass("bg-secondary");
  });
});
