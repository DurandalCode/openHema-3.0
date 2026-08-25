// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application, ApplicationEvent } from "@/entities/application/lib/types";
import { ApplicationRequestError } from "../api/mutation-error";
import { ApplicationCard } from "./application-card";

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов (см. `shared/ui/dialog.test.tsx`, `nomination-pools.test.tsx`).
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

const declareMutate = vi.fn();
const withdrawMutate = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

let declareState = { isPending: false };
let withdrawState = { isPending: false };

vi.mock("../api/use-declare-payment", () => ({
  useDeclarePayment: () => ({ mutate: declareMutate, isPending: declareState.isPending }),
}));
vi.mock("../api/use-withdraw-application", () => ({
  useWithdrawApplication: () => ({ mutate: withdrawMutate, isPending: withdrawState.isPending }),
}));
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (message: string) => toastSuccessMock(message),
  toastError: (message: string, options?: { retry?: () => void }) => toastErrorMock(message, options),
}));

const historyEvents: ApplicationEvent[] = [
  {
    type: "APPLICATION_EVENT_TYPE_SUBMITTED",
    actorId: "u1",
    actorDisplayName: "Иван Петров",
    occurredAt: "2026-03-18T10:00:00.000Z",
    sequence: 1,
  },
  {
    type: "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED",
    actorId: "admin-1",
    actorDisplayName: "Кораблёва Анна",
    occurredAt: "2026-03-20T10:00:00.000Z",
    sequence: 2,
  },
];

let detailState: {
  data: { application: Application; history: ApplicationEvent[] } | undefined;
  isLoading: boolean;
  error: Error | null;
} = {
  data: undefined,
  isLoading: false,
  error: null,
};
const detailRefetch = vi.fn();

vi.mock("../api/use-application-detail", () => ({
  useApplicationDetail: () => ({ ...detailState, refetch: detailRefetch }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  declareState = { isPending: false };
  withdrawState = { isPending: false };
  detailState = { data: undefined, isLoading: false, error: null };
});

function app(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    nominationId: "n1",
    tournamentId: "t1",
    applicantUserId: "u1",
    applicantDisplayName: "Иван Петров",
    state: "APPLICATION_STATE_SUBMITTED",
    club: "",
    needsEquipment: false,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("ApplicationCard", () => {
  it("shows the nomination title first, then the state badge (FR-15)", () => {
    render(<ApplicationCard application={app({})} nominationTitle="Лонгсворд" />);

    expect(screen.getByText("Лонгсворд")).toBeInTheDocument();
    expect(screen.getByText("Подана")).toBeInTheDocument();
  });

  it("renders without a title when nominationTitle is undefined (FR-26)", () => {
    render(<ApplicationCard application={app({})} />);

    expect(screen.queryByText("Лонгсворд")).not.toBeInTheDocument();
    expect(screen.getByText("Подана")).toBeInTheDocument();
  });

  it("gives the badge the tone from stateTone (FR-16)", () => {
    render(
      <ApplicationCard application={app({ state: "APPLICATION_STATE_REGISTERED" })} nominationTitle="Т" />,
    );

    const badge = screen.getByText("Зарегистрирована").closest('[data-slot="badge"]');
    expect(badge).toHaveAttribute("data-tone", "success");
  });

  it("mutes a terminal application's card (FR-17)", () => {
    const { container } = render(
      <ApplicationCard application={app({ state: "APPLICATION_STATE_REGISTERED" })} nominationTitle="Т" />,
    );

    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).toMatch(/opacity/);
  });

  it("does not mute a non-terminal application's card", () => {
    const { container } = render(
      <ApplicationCard application={app({ state: "APPLICATION_STATE_SUBMITTED" })} nominationTitle="Т" />,
    );

    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).not.toMatch(/opacity/);
  });

  it("shows the next expected step for a non-terminal application (FR-18)", () => {
    render(
      <ApplicationCard
        application={app({ state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" })}
        nominationTitle="Т"
      />,
    );

    expect(
      screen.getByText(/Оплата подтверждена — ожидает действия секретаря/),
    ).toBeInTheDocument();
    expect(screen.getByText(/секретарь\/организатор/)).toBeInTheDocument();
  });

  it("shows no next-step caption for a terminal application (FR-18)", () => {
    render(
      <ApplicationCard application={app({ state: "APPLICATION_STATE_REGISTERED" })} nominationTitle="Т" />,
    );

    expect(screen.queryByText(/ожидает:/)).not.toBeInTheDocument();
  });

  it("shows the club only when set (FR-19)", () => {
    const { rerender } = render(
      <ApplicationCard application={app({ club: "Клинок Севера" })} nominationTitle="Т" />,
    );
    expect(screen.getByText(/Клинок Севера/)).toBeInTheDocument();

    rerender(<ApplicationCard application={app({ club: "" })} nominationTitle="Т" />);
    expect(screen.queryByText(/Клуб:/)).not.toBeInTheDocument();
  });

  it("shows the equipment tag only when needsEquipment is true (FR-19)", () => {
    const { rerender } = render(
      <ApplicationCard application={app({ needsEquipment: true })} nominationTitle="Т" />,
    );
    expect(screen.getByText("нужна экипировка")).toBeInTheDocument();

    rerender(<ApplicationCard application={app({ needsEquipment: false })} nominationTitle="Т" />);
    expect(screen.queryByText("нужна экипировка")).not.toBeInTheDocument();
  });

  it("shows 'Я оплатил' and 'Отозвать' for SUBMITTED, no actions for REGISTERED (FR-20/AC-8/AC-9)", () => {
    const { rerender } = render(
      <ApplicationCard application={app({ state: "APPLICATION_STATE_SUBMITTED" })} nominationTitle="Т" />,
    );
    expect(screen.getByRole("button", { name: "Я оплатил" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отозвать" })).toBeInTheDocument();

    rerender(
      <ApplicationCard application={app({ state: "APPLICATION_STATE_REGISTERED" })} nominationTitle="Т" />,
    );
    expect(screen.queryByRole("button", { name: "Я оплатил" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отозвать" })).not.toBeInTheDocument();
  });

  it("declares payment immediately without a dialog and toasts success (AC-11)", () => {
    declareMutate.mockImplementation((_id, opts) => opts?.onSuccess?.());
    render(<ApplicationCard application={app({ state: "APPLICATION_STATE_SUBMITTED" })} nominationTitle="Т" />);

    fireEvent.click(screen.getByRole("button", { name: "Я оплатил" }));

    expect(declareMutate).toHaveBeenCalledWith("a1", expect.any(Object));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith("Оплата отмечена");
  });

  it("opens a ConfirmDialog with consequences before withdrawing, and toasts success on confirm (AC-10)", () => {
    withdrawMutate.mockImplementation((_id, opts) => opts?.onSuccess?.());
    render(<ApplicationCard application={app({ state: "APPLICATION_STATE_SUBMITTED" })} nominationTitle="Т" />);

    fireEvent.click(screen.getByRole("button", { name: "Отозвать" }));
    expect(withdrawMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText(/Заявка станет отозванной необратимо/),
    ).toBeInTheDocument();

    // Кнопка подтверждения внутри диалога — вторая с текстом «Отозвать»
    // (первая — та, что открыла диалог, и она вне `dialog`).
    const confirmButton = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Отозвать",
    );
    fireEvent.click(confirmButton!);

    expect(withdrawMutate).toHaveBeenCalledWith("a1", expect.any(Object));
    expect(toastSuccessMock).toHaveBeenCalledWith("Заявка отозвана");
  });

  it("toasts an error via applicationErrorMessage when declaring payment fails", () => {
    declareMutate.mockImplementation((_id, opts) =>
      opts?.onError?.(new ApplicationRequestError("Приём заявок в эту номинацию завершён", 409)),
    );
    render(<ApplicationCard application={app({ state: "APPLICATION_STATE_SUBMITTED" })} nominationTitle="Т" />);

    fireEvent.click(screen.getByRole("button", { name: "Я оплатил" }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Приём заявок в эту номинацию завершён",
      expect.any(Object),
    );
  });

  it("opens the history dialog showing current status and the change history (spec 0040, AC-8)", () => {
    const application = app({ state: "APPLICATION_STATE_PAID", applicantUserId: "u1" });
    detailState = {
      data: { application, history: historyEvents },
      isLoading: false,
      error: null,
    };

    render(<ApplicationCard application={application} nominationTitle="Т" />);

    expect(screen.queryByText("Заявка подана")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "История" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Оплачена")).toBeInTheDocument();
    expect(within(dialog).getByText("Заявка подана")).toBeInTheDocument();
    expect(within(dialog).getByText("Оплата подтверждена")).toBeInTheDocument();
    expect(within(dialog).getByText(/Кораблёва Анна/)).toBeInTheDocument();
    expect(within(dialog).getByText(/организатор/)).toBeInTheDocument();
  });
});
