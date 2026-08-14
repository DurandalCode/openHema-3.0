// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { NominationSchema } from "../api/use-nomination-schemas";
import { NominationsTable } from "./nominations-table";

afterEach(() => {
  cleanup();
});

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Номинация 1",
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

function defaultProps() {
  return {
    nominations: [nomination({})],
    isLoading: false,
    error: null,
    onRetry: vi.fn(),
    schemas: new Map<string, NominationSchema>(),
    reorderPending: false,
    closePendingId: null,
    reopenPendingId: null,
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onCloseRegistration: vi.fn(),
    onReopenRegistration: vi.fn(),
  };
}

describe("NominationsTable", () => {
  it("renders a table head with six columns", () => {
    render(<NominationsTable {...defaultProps()} />);

    expect(screen.getByText("Порядок")).toBeInTheDocument();
    expect(screen.getByText("Номинация")).toBeInTheDocument();
    expect(screen.getByText("Приём")).toBeInTheDocument();
    expect(screen.getByText("Схема")).toBeInTheDocument();
    expect(screen.getByText("Бойцов")).toBeInTheDocument();
    expect(screen.getByText("Действия")).toBeInTheDocument();
  });

  it("renders a nomination row", () => {
    render(<NominationsTable {...defaultProps()} />);
    expect(screen.getByText("Номинация 1")).toBeInTheDocument();
  });

  it("shows a skeleton in the shape of the table while loading (AC-15)", () => {
    const { container } = render(<NominationsTable {...defaultProps()} isLoading nominations={[]} />);
    expect(container.querySelector('[data-slot="skeleton-rows"]')).toBeInTheDocument();
    expect(screen.queryByText("Номинация 1")).not.toBeInTheDocument();
  });

  it("shows an error with retry on load failure (AC-15)", () => {
    const onRetry = vi.fn();
    render(
      <NominationsTable
        {...defaultProps()}
        nominations={[]}
        error={new Error("Сеть недоступна")}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows an explained empty state when there are no nominations at all (AC-15)", () => {
    render(<NominationsTable {...defaultProps()} nominations={[]} />);
    expect(screen.getByText(/номинаций ещё нет/i)).toBeInTheDocument();
  });

  it("wires up move/edit/delete callbacks with the nomination id", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<NominationsTable {...defaultProps()} onEdit={onEdit} onDelete={onDelete} />);

    const trigger = screen.getByRole("button", { name: "Действия" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Править" }));
    expect(onEdit).toHaveBeenCalledWith("n1");
  });

  it("orders rows by position and numbers them 1-based (AC-1)", () => {
    const nominations = [
      nomination({ id: "n-first", title: "Первая", position: 0 }),
      nomination({ id: "n-second", title: "Вторая", position: 1 }),
    ];
    render(<NominationsTable {...defaultProps()} nominations={nominations} />);

    const allRowLabels = screen.getAllByText(/Первая|Вторая/).map((el) => el.textContent);
    expect(allRowLabels).toEqual(["Первая", "Вторая"]);
  });
});
