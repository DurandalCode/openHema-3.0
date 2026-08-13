// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Application } from "@/entities/application/lib/types";
import { ApplicationRow } from "./application-row";

/**
 * Radix `Tooltip`/`Popper` в jsdom нуждаются в polyfill'ах (см.
 * `features/admin/ui/user-row.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

const NOW = new Date("2026-03-25T12:00:00.000Z");

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

const defaultProps = {
  nominationTitle: "Лонгсворд",
  isOverfullNomination: false,
  onOpenCard: vi.fn(),
  onConfirmPayment: vi.fn(),
  onRegister: vi.fn(),
  now: NOW,
};

describe("ApplicationRow", () => {
  it("renders the five columns: applicant, nomination, club, status, action", () => {
    render(<ApplicationRow application={app({})} {...defaultProps} onOpenCard={vi.fn()} />);

    expect(screen.getByText("Иван Петров")).toBeInTheDocument();
    expect(screen.getByText("Лонгсворд")).toBeInTheDocument();
    expect(screen.getByText("Клинок Севера")).toBeInTheDocument();
    expect(screen.getByText(/ждём отметку об оплате от бойца/)).toBeInTheDocument();
  });

  it("shows a state caption + relative date subtext under the applicant name (FR-2)", () => {
    render(<ApplicationRow application={app({})} {...defaultProps} onOpenCard={vi.fn()} />);

    expect(screen.getByText(/подана/)).toBeInTheDocument();
  });

  it("shows a 'номинация переполнена' tag when isOverfullNomination is true (FR-4)", () => {
    render(
      <ApplicationRow
        application={app({ state: "APPLICATION_STATE_PAID" })}
        {...defaultProps}
        isOverfullNomination
        onOpenCard={vi.fn()}
      />,
    );

    expect(screen.getByText("номинация переполнена")).toBeInTheDocument();
  });

  it("shows a 'нужна экипировка' tag when the application needs equipment (FR-4)", () => {
    render(
      <ApplicationRow application={app({ needsEquipment: true })} {...defaultProps} onOpenCard={vi.fn()} />,
    );

    expect(screen.getByText("нужна экипировка")).toBeInTheDocument();
  });

  it("shows the 'Подтвердить оплату' action button for AWAITING_PAYMENT_CONFIRMATION", () => {
    const onConfirmPayment = vi.fn();
    render(
      <ApplicationRow
        application={app({ state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" })}
        {...defaultProps}
        onConfirmPayment={onConfirmPayment}
        onOpenCard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить оплату" }));
    expect(onConfirmPayment).toHaveBeenCalledWith("a1");
  });

  it("shows the 'Зарегистрировать' action button for PAID", () => {
    const onRegister = vi.fn();
    render(
      <ApplicationRow
        application={app({ state: "APPLICATION_STATE_PAID" })}
        {...defaultProps}
        onRegister={onRegister}
        onOpenCard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Зарегистрировать" }));
    expect(onRegister).toHaveBeenCalledWith("a1");
  });

  it("shows a reason instead of a button for REGISTERED/WITHDRAWN (FR-5)", () => {
    render(
      <ApplicationRow
        application={app({ state: "APPLICATION_STATE_REGISTERED" })}
        {...defaultProps}
        onOpenCard={vi.fn()}
      />,
    );

    expect(screen.getByText(/терминально · зарегистрирована/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("mutes terminal rows and additionally strikes through a withdrawn applicant's name (FR-3)", () => {
    const { container: registeredContainer } = render(
      <ApplicationRow
        application={app({ id: "reg", state: "APPLICATION_STATE_REGISTERED" })}
        {...defaultProps}
        onOpenCard={vi.fn()}
      />,
    );
    const registeredRow = registeredContainer.querySelector('[data-slot="application-row"]');
    expect(registeredRow?.className).toMatch(/opacity/);
    expect(screen.getByText("Иван Петров").className).not.toMatch(/line-through/);
    cleanup();

    render(
      <ApplicationRow
        application={app({ id: "wd", state: "APPLICATION_STATE_WITHDRAWN" })}
        {...defaultProps}
        onOpenCard={vi.fn()}
      />,
    );
    expect(screen.getByText("Иван Петров").className).toMatch(/line-through/);
  });

  it("clicking the row opens the card", () => {
    const onOpenCard = vi.fn();
    render(<ApplicationRow application={app({})} {...defaultProps} onOpenCard={onOpenCard} />);

    fireEvent.click(screen.getByText("Иван Петров"));
    expect(onOpenCard).toHaveBeenCalledWith("a1");
  });

  it("clicking the action button does NOT also open the card (NFR-4/AC-16)", () => {
    const onOpenCard = vi.fn();
    const onConfirmPayment = vi.fn();
    render(
      <ApplicationRow
        application={app({ state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" })}
        {...defaultProps}
        onOpenCard={onOpenCard}
        onConfirmPayment={onConfirmPayment}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить оплату" }));

    expect(onConfirmPayment).toHaveBeenCalledTimes(1);
    expect(onOpenCard).not.toHaveBeenCalled();
  });
});
