// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { StatusCounts } from "../lib/select-applications";
import { ApplicationsFilters } from "./applications-filters";

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

const COUNTS: StatusCounts = {
  APPLICATION_STATE_UNSPECIFIED: 0,
  APPLICATION_STATE_SUBMITTED: 31,
  APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION: 6,
  APPLICATION_STATE_PAID: 2,
  APPLICATION_STATE_REGISTERED: 124,
  APPLICATION_STATE_WITHDRAWN: 3,
};

const nominations: Nomination[] = [
  {
    id: "n1",
    tournamentId: "t1",
    title: "Лонгсворд",
    description: "",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "n2",
    tournamentId: "t1",
    title: "Сабля",
    description: "",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 1,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "",
    updatedAt: "",
  },
];

function baseProps() {
  return {
    statuses: new Set<ApplicationState>(),
    onStatusesChange: vi.fn(),
    counts: COUNTS,
    nominations,
    nominationIds: new Set<string>(),
    onNominationIdsChange: vi.fn(),
    needsEquipment: false,
    onNeedsEquipmentChange: vi.fn(),
    query: "",
    onQueryChange: vi.fn(),
    onReset: vi.fn(),
  };
}

describe("ApplicationsFilters", () => {
  it("shows status chips with counts from the full list", () => {
    render(<ApplicationsFilters {...baseProps()} />);

    expect(screen.getByRole("button", { name: /Ожидает подтверждения/ })).toHaveTextContent("6");
    expect(screen.getByRole("button", { name: /Подана/ })).toHaveTextContent("31");
    expect(screen.getByRole("button", { name: /Зарегистрирована/ })).toHaveTextContent("124");
  });

  it("toggles a status chip on click via aria-pressed, multi-select (AC-3)", () => {
    const onStatusesChange = vi.fn();
    const props = baseProps();
    render(<ApplicationsFilters {...props} onStatusesChange={onStatusesChange} />);

    const chip = screen.getByRole("button", { name: /Оплачена/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chip);
    expect(onStatusesChange).toHaveBeenCalledWith(new Set(["APPLICATION_STATE_PAID"]));
  });

  it("marks a selected status chip as pressed", () => {
    const props = baseProps();
    props.statuses = new Set<ApplicationState>(["APPLICATION_STATE_PAID"]);
    render(<ApplicationsFilters {...props} />);

    expect(screen.getByRole("button", { name: /Оплачена/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows 'Все номинации' when none is selected", () => {
    render(<ApplicationsFilters {...baseProps()} />);
    expect(screen.getByRole("button", { name: /Все номинации/ })).toBeInTheDocument();
  });

  it("shows the single nomination's title when exactly one is selected (AC-4)", () => {
    const props = baseProps();
    props.nominationIds = new Set(["n1"]);
    render(<ApplicationsFilters {...props} />);
    expect(screen.getByRole("button", { name: "Лонгсворд" })).toBeInTheDocument();
  });

  it("shows 'N номинаций' when more than one is selected (AC-4)", () => {
    const props = baseProps();
    props.nominationIds = new Set(["n1", "n2"]);
    render(<ApplicationsFilters {...props} />);
    expect(screen.getByRole("button", { name: "2 номинации" })).toBeInTheDocument();
  });

  it("toggles the equipment chip", () => {
    const onNeedsEquipmentChange = vi.fn();
    render(<ApplicationsFilters {...baseProps()} onNeedsEquipmentChange={onNeedsEquipmentChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Нужна экипировка/ }));
    expect(onNeedsEquipmentChange).toHaveBeenCalledWith(true);
  });

  it("has an accessible search input", () => {
    const onQueryChange = vi.fn();
    render(<ApplicationsFilters {...baseProps()} onQueryChange={onQueryChange} />);

    fireEvent.change(screen.getByRole("searchbox", { name: /поиск/i }), {
      target: { value: "Клинок" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("Клинок");
  });

  it("shows a reset action only when a filter or search is active", () => {
    const { rerender } = render(<ApplicationsFilters {...baseProps()} />);
    expect(screen.queryByRole("button", { name: /Сбросить/ })).not.toBeInTheDocument();

    const props = baseProps();
    props.query = "клинок";
    rerender(<ApplicationsFilters {...props} />);
    expect(screen.getByRole("button", { name: /Сбросить/ })).toBeInTheDocument();
  });

  it("calls onReset when the reset action is clicked", () => {
    const onReset = vi.fn();
    const props = baseProps();
    props.needsEquipment = true;
    render(<ApplicationsFilters {...props} onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: /Сбросить/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
