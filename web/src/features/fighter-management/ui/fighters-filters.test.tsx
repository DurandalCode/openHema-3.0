// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FighterStatus } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { FightersFilters } from "./fighters-filters";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

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
  statuses: new Set<FighterStatus>(),
  onStatusesChange: vi.fn(),
  counts: { active: 159, withdrawn: 5 },
  nominations: [nomination({ id: "n1", title: "Лонгсворд" }), nomination({ id: "n2", title: "Сабля" })],
  nominationIds: new Set<string>(),
  onNominationIdsChange: vi.fn(),
  clubs: new Set<string>(),
  onClubsChange: vi.fn(),
  clubOptions: { clubs: ["Клинок Севера", "Стальной Клуб"], hasNoClub: true },
  query: "",
  onQueryChange: vi.fn(),
  onReset: vi.fn(),
};

describe("FightersFilters", () => {
  it("shows status chips with counts (FR-7)", () => {
    render(<FightersFilters {...defaultProps} onStatusesChange={vi.fn()} />);

    expect(screen.getByText("Активные")).toBeInTheDocument();
    expect(screen.getByText("159")).toBeInTheDocument();
    expect(screen.getByText("Выбыли")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("toggles a status chip and reports aria-pressed", () => {
    const onStatusesChange = vi.fn();
    render(<FightersFilters {...defaultProps} onStatusesChange={onStatusesChange} />);

    const chip = screen.getByRole("button", { name: /Активные/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chip);
    expect(onStatusesChange).toHaveBeenCalledWith(new Set(["FIGHTER_STATUS_ACTIVE"]));
  });

  it("supports selecting both status chips at once (multi-select)", () => {
    const onStatusesChange = vi.fn();
    render(
      <FightersFilters
        {...defaultProps}
        statuses={new Set<FighterStatus>(["FIGHTER_STATUS_ACTIVE"])}
        onStatusesChange={onStatusesChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Выбыли/ }));
    expect(onStatusesChange).toHaveBeenCalledWith(
      new Set(["FIGHTER_STATUS_ACTIVE", "FIGHTER_STATUS_WITHDRAWN"]),
    );
  });

  it("labels the nomination dropdown 'Все номинации' when none selected", () => {
    render(<FightersFilters {...defaultProps} />);
    expect(screen.getByText("Все номинации")).toBeInTheDocument();
  });

  it("labels the nomination dropdown with the single selected title", () => {
    render(<FightersFilters {...defaultProps} nominationIds={new Set(["n1"])} />);
    expect(screen.getByText("Лонгсворд")).toBeInTheDocument();
  });

  it("labels the nomination dropdown '2 номинации' when two are selected", () => {
    render(<FightersFilters {...defaultProps} nominationIds={new Set(["n1", "n2"])} />);
    expect(screen.getByText("2 номинации")).toBeInTheDocument();
  });

  it("labels the club dropdown 'Все клубы' when none selected", () => {
    render(<FightersFilters {...defaultProps} />);
    expect(screen.getByText("Все клубы")).toBeInTheDocument();
  });

  it("offers a 'Без клуба' item in the club dropdown when hasNoClub is true", () => {
    render(<FightersFilters {...defaultProps} />);
    // Radix DropdownMenuTrigger не открывается по jsdom-эмуляции click (нет
    // реального pointer capture) — открываем через keyDown Enter, тот же
    // паттерн, что и в остальных дропдаунах проекта (applications-screen.test.tsx).
    fireEvent.keyDown(screen.getByRole("button", { name: "Все клубы" }), { key: "Enter" });
    expect(screen.getByText("Без клуба")).toBeInTheDocument();
  });

  it("calls onQueryChange as the user types", () => {
    const onQueryChange = vi.fn();
    render(<FightersFilters {...defaultProps} onQueryChange={onQueryChange} />);

    fireEvent.change(screen.getByPlaceholderText("Поиск по имени или клубу"), {
      target: { value: "иван" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("иван");
  });

  it("shows a reset action only while a filter or query is active", () => {
    const { rerender } = render(<FightersFilters {...defaultProps} />);
    expect(screen.queryByText("Сбросить фильтры")).not.toBeInTheDocument();

    rerender(<FightersFilters {...defaultProps} query="иван" />);
    const resetBtn = screen.getByText("Сбросить фильтры");

    const onReset = vi.fn();
    rerender(<FightersFilters {...defaultProps} query="иван" onReset={onReset} />);
    fireEvent.click(screen.getByText("Сбросить фильтры"));
    expect(onReset).toHaveBeenCalled();
    expect(resetBtn).toBeInTheDocument();
  });
});
