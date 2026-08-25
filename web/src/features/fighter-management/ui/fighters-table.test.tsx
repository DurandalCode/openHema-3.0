// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { FightersTable } from "./fighters-table";
import { UnauthorizedError } from "@/shared/api/unauthorized";

afterEach(() => {
  cleanup();
});

function fighter(overrides: Partial<Fighter>): Fighter {
  return {
    id: "f1",
    tournamentId: "t1",
    name: "Иван Петров",
    club: "Клинок Севера",
    status: "FIGHTER_STATUS_ACTIVE",
    withdrawalReason: "WITHDRAWAL_REASON_UNSPECIFIED",
    participations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fromApplication: true,
    linkedAccountId: "",
    linkedAccountDisplayName: "",
    mergedIntoId: "",
    ...overrides,
  };
}

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Лонгсворд",
    description: "",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const defaultProps = {
  fighters: [fighter({})],
  nominations: [nomination({})],
  isLoading: false,
  error: null,
  onRetry: vi.fn(),
  hasAnyFighters: true,
  onOpenCard: vi.fn(),
};

describe("FightersTable", () => {
  it("renders a table head with five columns", () => {
    render(<FightersTable {...defaultProps} />);

    expect(screen.getByText("Боец")).toBeInTheDocument();
    expect(screen.getByText("Клуб")).toBeInTheDocument();
    expect(screen.getByText("Участие в номинациях")).toBeInTheDocument();
    expect(screen.getByText("Статус")).toBeInTheDocument();
    expect(screen.getByText("Происхождение")).toBeInTheDocument();
  });

  it("renders a fighter row", () => {
    render(<FightersTable {...defaultProps} />);
    expect(screen.getByText("Иван Петров")).toBeInTheDocument();
  });

  it("shows a skeleton in the shape of the table while loading (FR-24)", () => {
    const { container } = render(<FightersTable {...defaultProps} isLoading fighters={[]} />);
    expect(container.querySelector('[data-slot="skeleton-rows"]')).toBeInTheDocument();
    expect(screen.queryByText("Иван Петров")).not.toBeInTheDocument();
  });

  it("shows an error with retry on load failure (FR-24)", () => {
    const onRetry = vi.fn();
    render(
      <FightersTable {...defaultProps} fighters={[]} error={new Error("Сеть недоступна")} onRetry={onRetry} />,
    );

    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("does not render its own error block when the session expired (spec 0039, FR-18/AC-12) — the global dialog already explains it", () => {
    render(
      <FightersTable {...defaultProps} fighters={[]} error={new UnauthorizedError()} />,
    );

    expect(screen.queryByText("unauthenticated")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
  });

  it("shows an empty roster message when there are no fighters at all (FR-25)", () => {
    render(<FightersTable {...defaultProps} fighters={[]} hasAnyFighters={false} />);
    expect(screen.getByText(/в ростере пока нет бойцов/i)).toBeInTheDocument();
  });

  it("shows a distinct 'nothing found' message when filters exclude everyone (FR-25/AC-16)", () => {
    render(<FightersTable {...defaultProps} fighters={[]} hasAnyFighters />);
    expect(screen.getByText(/по выбранным фильтрам никого не найдено/i)).toBeInTheDocument();
    expect(screen.queryByText(/в ростере пока нет бойцов/i)).not.toBeInTheDocument();
  });

  it("clicking a row calls onOpenCard with the fighter id", () => {
    const onOpenCard = vi.fn();
    render(<FightersTable {...defaultProps} onOpenCard={onOpenCard} />);

    fireEvent.click(screen.getByText("Иван Петров"));
    expect(onOpenCard).toHaveBeenCalledWith("f1");
  });
});
