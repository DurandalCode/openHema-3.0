// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersTable } from "./users-table";
import { sortUsers } from "../lib/select-users";
import type { AdminUser } from "../api/requests";

afterEach(() => {
  cleanup();
});

function user(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: "id",
    email: "user@hema.test",
    displayName: "",
    role: "ROLE_USER",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const admin = user({ id: "a1", displayName: "Яков", role: "ROLE_ADMIN" });
const zed = user({ id: "u-z", displayName: "Захар", role: "ROLE_USER" });
const anna = user({ id: "u-a", displayName: "Анна", role: "ROLE_USER" });

describe("UsersTable", () => {
  it("renders a header with four columns", () => {
    render(
      <UsersTable
        users={[]}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        hasAnyUsers={false}
        currentUserId="none"
        getAction={() => undefined}
      />,
    );

    expect(screen.getByText("Пользователь")).toBeInTheDocument();
    expect(screen.getByText("Роль")).toBeInTheDocument();
    expect(screen.getByText("Регистрация")).toBeInTheDocument();
    expect(screen.getByText("Действие")).toBeInTheDocument();
  });

  it("renders rows in the order produced by sortUsers (FR-3)", () => {
    const scrambled = [zed, admin, anna];
    render(
      <UsersTable
        users={scrambled}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        hasAnyUsers
        currentUserId="none"
        getAction={() => undefined}
      />,
    );

    const expectedOrder = sortUsers(scrambled).map((u) => u.displayName);
    const rendered = screen.getAllByText(/^(Яков|Захар|Анна)$/).map((el) => el.textContent);
    expect(rendered).toEqual(expectedOrder);
  });

  it("shows a table-shaped skeleton while loading, not a loading text (FR-20)", () => {
    render(
      <UsersTable
        users={[]}
        isLoading
        error={null}
        onRetry={vi.fn()}
        hasAnyUsers
        currentUserId="none"
        getAction={() => undefined}
      />,
    );

    expect(document.querySelector('[data-slot="skeleton-rows"]')).toBeInTheDocument();
    expect(screen.queryByText(/загрузка/i)).not.toBeInTheDocument();
  });

  it("shows an error state with a retry action (FR-21)", () => {
    const onRetry = vi.fn();
    render(
      <UsersTable
        users={[]}
        isLoading={false}
        error={new Error("Сеть недоступна")}
        onRetry={onRetry}
        hasAnyUsers
        currentUserId="none"
        getAction={() => undefined}
      />,
    );

    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Повторить/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct empty state when the system has no accounts at all (FR-22)", () => {
    render(
      <UsersTable
        users={[]}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        hasAnyUsers={false}
        currentUserId="none"
        getAction={() => undefined}
      />,
    );

    expect(screen.getByText(/нет ни одной учётной записи/i)).toBeInTheDocument();
  });

  it("shows a distinct empty state when filter/search found nothing (FR-22)", () => {
    render(
      <UsersTable
        users={[]}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        hasAnyUsers
        currentUserId="none"
        getAction={() => undefined}
      />,
    );

    expect(screen.getByText(/ничего не найдено/i)).toBeInTheDocument();
  });

  it("wraps the header and rows in a horizontal table-scroll container (FR-8/AC-3)", () => {
    render(
      <UsersTable
        users={[admin, zed, anna]}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        hasAnyUsers
        currentUserId="none"
        getAction={() => undefined}
      />,
    );

    const scroll = document.querySelector('[data-slot="table-scroll"]');
    expect(scroll).toBeInTheDocument();
    expect(scroll?.querySelector('[data-slot="table-head"]')).toBeInTheDocument();
    expect(scroll?.querySelectorAll('[data-slot="user-row"]')).toHaveLength(3);
  });
});
