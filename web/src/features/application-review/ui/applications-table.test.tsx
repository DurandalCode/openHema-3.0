// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Application } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { ApplicationsTable } from "./applications-table";
import { UnauthorizedError } from "@/shared/api/unauthorized";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

function app(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    nominationId: "n1",
    tournamentId: "t1",
    applicantUserId: "u1",
    applicantDisplayName: "Иван Петров",
    state: "APPLICATION_STATE_SUBMITTED",
    club: "Клинок Севера",
    needsEquipment: false,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    ...overrides,
  };
}

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
];

function baseProps() {
  return {
    applications: [] as Application[],
    nominations,
    overfullNominationIds: new Set<string>(),
    isLoading: false,
    error: null as Error | null,
    onRetry: vi.fn(),
    hasAnyApplications: false,
    onOpenCard: vi.fn(),
    onConfirmPayment: vi.fn(),
    onRegister: vi.fn(),
  };
}

describe("ApplicationsTable", () => {
  it("renders a header with five columns", () => {
    render(<ApplicationsTable {...baseProps()} />);
    ["Заявитель", "Номинация", "Клуб", "Статус", "Действие"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("renders rows in sortApplications order (FR-6)", () => {
    const submitted = app({ id: "submitted", state: "APPLICATION_STATE_SUBMITTED", applicantDisplayName: "Submitted Person" });
    const paid = app({ id: "paid", state: "APPLICATION_STATE_PAID", applicantDisplayName: "Paid Person" });
    render(<ApplicationsTable {...baseProps()} applications={[submitted, paid]} hasAnyApplications />);

    const rows = document.querySelectorAll('[data-slot="application-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Paid Person");
    expect(rows[1]).toHaveTextContent("Submitted Person");
  });

  it("shows a table-shaped skeleton while loading, no 'Загрузка…' text (FR-24)", () => {
    render(<ApplicationsTable {...baseProps()} isLoading />);
    expect(document.querySelector('[data-slot="skeleton-rows"]')).toBeInTheDocument();
    expect(screen.queryByText(/Загрузка/)).not.toBeInTheDocument();
  });

  it("shows an error state with a retry action (FR-25)", () => {
    const onRetry = vi.fn();
    render(<ApplicationsTable {...baseProps()} error={new Error("Сеть недоступна")} onRetry={onRetry} />);

    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not render its own error block when the session expired (spec 0039, FR-18/AC-12)", () => {
    render(<ApplicationsTable {...baseProps()} error={new UnauthorizedError()} />);

    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
  });

  it("shows 'заявок в турнире нет' when there are no applications at all (FR-26)", () => {
    render(<ApplicationsTable {...baseProps()} hasAnyApplications={false} />);
    expect(screen.getByText(/заявок в турнире нет/i)).toBeInTheDocument();
  });

  it("shows a different empty state when filters exclude everything (FR-26)", () => {
    render(<ApplicationsTable {...baseProps()} hasAnyApplications />);
    expect(screen.queryByText(/заявок в турнире нет/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ничего не найдено/i)).toBeInTheDocument();
  });
});
