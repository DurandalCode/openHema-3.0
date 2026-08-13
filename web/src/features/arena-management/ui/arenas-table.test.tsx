// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Arena } from "@/entities/arena/lib/types";
import type { ArenaBoardState } from "../api/use-arena-boards";
import { ArenasTable } from "./arenas-table";

afterEach(() => {
  cleanup();
});

function arena(overrides: Partial<Arena>): Arena {
  return {
    id: "a1",
    tournamentId: "t1",
    name: "Арена 1",
    description: "",
    position: 0,
    status: "ARENA_STATUS_ACTIVE",
    defaultDurationSeconds: 180,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const freeBoard: ArenaBoardState = {
  status: { kind: "free", title: "Свободна", detail: null, pulse: false },
  isError: false,
};

function defaultProps() {
  return {
    arenas: [arena({})],
    showArchived: false,
    isLoading: false,
    error: null,
    onRetry: vi.fn(),
    boardStates: new Map<string, ArenaBoardState>([["a1", freeBoard]]),
    reorderPending: false,
    archivePendingId: null,
    restorePendingId: null,
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onEdit: vi.fn(),
    onArchive: vi.fn(),
    onRestore: vi.fn(),
  };
}

describe("ArenasTable", () => {
  it("renders a table head with five columns", () => {
    render(<ArenasTable {...defaultProps()} />);

    expect(screen.getByText("Порядок")).toBeInTheDocument();
    expect(screen.getByText("Площадка")).toBeInTheDocument();
    expect(screen.getByText("Состояние")).toBeInTheDocument();
    expect(screen.getByText("Длительность")).toBeInTheDocument();
    expect(screen.getByText("Действия")).toBeInTheDocument();
  });

  it("renders an arena row", () => {
    render(<ArenasTable {...defaultProps()} />);
    expect(screen.getByText("Арена 1")).toBeInTheDocument();
  });

  it("shows a skeleton in the shape of the table while loading (FR-21)", () => {
    const { container } = render(<ArenasTable {...defaultProps()} isLoading arenas={[]} />);
    expect(container.querySelector('[data-slot="skeleton-rows"]')).toBeInTheDocument();
    expect(screen.queryByText("Арена 1")).not.toBeInTheDocument();
  });

  it("shows an error with retry on load failure (FR-21)", () => {
    const onRetry = vi.fn();
    render(
      <ArenasTable {...defaultProps()} arenas={[]} error={new Error("Сеть недоступна")} onRetry={onRetry} />,
    );

    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows 'площадок ещё нет' when there are no arenas at all (FR-22/AC-14)", () => {
    render(<ArenasTable {...defaultProps()} arenas={[]} />);
    expect(screen.getByText(/площадок ещё нет/i)).toBeInTheDocument();
  });

  it("shows a distinct 'все площадки в архиве' when every arena is archived and hidden (FR-22/AC-14)", () => {
    render(
      <ArenasTable
        {...defaultProps()}
        arenas={[arena({ status: "ARENA_STATUS_ARCHIVED" })]}
        showArchived={false}
      />,
    );
    expect(screen.getByText(/все площадки в архиве/i)).toBeInTheDocument();
    expect(screen.queryByText(/площадок ещё нет/i)).not.toBeInTheDocument();
  });

  it("orders active arenas by position and puts archived ones after them (FR-2)", () => {
    const arenas = [
      arena({ id: "a-active-1", name: "Первая", position: 0 }),
      arena({ id: "a-archived", name: "Архивная", position: 1, status: "ARENA_STATUS_ARCHIVED" }),
      arena({ id: "a-active-2", name: "Вторая", position: 2 }),
    ];
    render(
      <ArenasTable
        {...defaultProps()}
        arenas={arenas}
        showArchived
        boardStates={
          new Map([
            ["a-active-1", freeBoard],
            ["a-active-2", freeBoard],
          ])
        }
      />,
    );

    const allRowLabels = screen.getAllByText(/Первая|Вторая|Архивная/).map((el) => el.textContent);
    expect(allRowLabels).toEqual(["Первая", "Вторая", "Архивная"]);
  });

  it("does not query the archived row's board — treats it as archived regardless of boardStates (AC-4)", () => {
    render(
      <ArenasTable
        {...defaultProps()}
        arenas={[arena({ status: "ARENA_STATUS_ARCHIVED" })]}
        showArchived
        boardStates={new Map()}
      />,
    );
    expect(screen.getByText("В архиве")).toBeInTheDocument();
  });

  it("wires up edit/archive callbacks with the arena id", () => {
    const onEdit = vi.fn();
    const onArchive = vi.fn();
    render(<ArenasTable {...defaultProps()} onEdit={onEdit} onArchive={onArchive} />);

    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    expect(onEdit).toHaveBeenCalledWith("a1");
    fireEvent.click(screen.getByRole("button", { name: "Убрать в архив" }));
    expect(onArchive).toHaveBeenCalledWith("a1");
  });
});
