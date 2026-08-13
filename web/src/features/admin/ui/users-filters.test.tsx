// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersFilters } from "./users-filters";

afterEach(() => {
  cleanup();
});

const counts = { admins: 3, users: 164, total: 167 };

describe("UsersFilters", () => {
  it("renders three role chips", () => {
    render(
      <UsersFilters role="all" onRoleChange={vi.fn()} counts={counts} query="" onQueryChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /Все/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Администраторы/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Пользователи/ })).toBeInTheDocument();
  });

  it("marks exactly one chip as pressed at a time (FR-5)", () => {
    render(
      <UsersFilters role="admin" onRoleChange={vi.fn()} counts={counts} query="" onQueryChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /Все/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Администраторы/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Пользователи/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("defaults to 'Все' pressed", () => {
    render(
      <UsersFilters role="all" onRoleChange={vi.fn()} counts={counts} query="" onQueryChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /Все/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows role counts on the admins/users chips (FR-6)", () => {
    render(
      <UsersFilters role="all" onRoleChange={vi.fn()} counts={counts} query="" onQueryChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /Администраторы/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Пользователи/ })).toHaveTextContent("164");
  });

  it("calls onRoleChange with the clicked role", () => {
    const onRoleChange = vi.fn();
    render(
      <UsersFilters role="all" onRoleChange={onRoleChange} counts={counts} query="" onQueryChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Администраторы/ }));
    expect(onRoleChange).toHaveBeenCalledWith("admin");
  });

  it("has a search input with an accessible name", () => {
    render(
      <UsersFilters role="all" onRoleChange={vi.fn()} counts={counts} query="" onQueryChange={vi.fn()} />,
    );

    expect(screen.getByRole("searchbox", { name: /поиск/i })).toBeInTheDocument();
  });

  it("calls onQueryChange as the user types", () => {
    const onQueryChange = vi.fn();
    render(
      <UsersFilters role="all" onRoleChange={vi.fn()} counts={counts} query="" onQueryChange={onQueryChange} />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: /поиск/i }), { target: { value: "Анна" } });
    expect(onQueryChange).toHaveBeenCalledWith("Анна");
  });
});
