// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UserRow } from "./user-row";
import type { AdminUser } from "../api/requests";

/**
 * Radix `Tooltip`/`Popper` в jsdom нуждаются в polyfill'ах (см.
 * `shared/ui/tooltip.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  if (!("ResizeObserver" in window)) {
    // @ts-expect-error - минимальный polyfill для jsdom
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  cleanup();
});

const NOW = new Date("2026-08-13T12:00:00.000Z");

const admin: AdminUser = {
  id: "admin-1",
  email: "anna@klinok.ru",
  displayName: "Анна Кораблёва",
  role: "ROLE_ADMIN",
  createdAt: "2026-08-12T09:30:00.000Z", // "вчера"
};

const regular: AdminUser = {
  id: "user-1",
  email: "boris@klinok.ru",
  displayName: "Борис Волков",
  role: "ROLE_USER",
  createdAt: "2026-08-12T09:30:00.000Z",
};

describe("UserRow", () => {
  it("renders initials, name, email and role tag", () => {
    render(<UserRow user={admin} isCurrentUser={false} now={NOW} />);

    expect(screen.getByText("АК")).toBeInTheDocument();
    expect(screen.getByText("Анна Кораблёва")).toBeInTheDocument();
    expect(screen.getByText("anna@klinok.ru")).toBeInTheDocument();
  });

  it("shows the registration date in relative form with a tooltip carrying the full date/time (FR-2/AC-2)", async () => {
    render(<UserRow user={admin} isCurrentUser={false} now={NOW} />);

    expect(screen.getByText("вчера")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(screen.getByText("вчера"));

    const tooltip = await screen.findByRole("tooltip");
    // Полная дата/время — реальный `shared/lib/datetime.ts#formatDateTime`
    // (родительный падеж месяца, локальное время окружения), поэтому
    // ожидание строится тем же форматтером, а не хардкодится в UTC.
    const { formatDateTime } = await import("@/shared/lib/datetime");
    expect(tooltip).toHaveTextContent(formatDateTime(admin.createdAt));
  });

  it("shows a 'Понизить' action for an admin row", () => {
    const onClick = vi.fn();
    render(
      <UserRow
        user={admin}
        isCurrentUser={false}
        now={NOW}
        action={{ label: "Понизить", onClick }}
      />,
    );

    const button = screen.getByRole("button", { name: "Понизить" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows a 'Повысить' action for a regular user row", () => {
    render(
      <UserRow
        user={regular}
        isCurrentUser={false}
        now={NOW}
        action={{ label: "Повысить", onClick: vi.fn() }}
      />,
    );

    expect(screen.getByRole("button", { name: "Повысить" })).toBeInTheDocument();
  });

  it("shows 'вы · нельзя понизить себя' instead of a button for the current user's own row (FR-10/AC-8)", () => {
    render(
      <UserRow
        user={admin}
        isCurrentUser
        now={NOW}
        action={{ label: "Понизить", onClick: vi.fn() }}
      />,
    );

    expect(screen.getByText("вы · нельзя понизить себя")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Понизить" })).not.toBeInTheDocument();
  });
});
