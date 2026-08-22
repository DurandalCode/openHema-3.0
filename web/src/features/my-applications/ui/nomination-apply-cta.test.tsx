// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NominationApplyCta } from "./nomination-apply-cta";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { Application } from "@/entities/application/lib/types";

const useMyApplicationsMock = vi.fn();

vi.mock("@/features/my-applications/api/use-my-applications", () => ({
  useMyApplications: (...args: unknown[]) => useMyApplicationsMock(...args),
}));

afterEach(() => {
  cleanup();
  useMyApplicationsMock.mockReset();
});

function nomination(overrides: Partial<Nomination> = {}): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Длинный меч",
    description: "",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    nominationId: "n1",
    tournamentId: "t1",
    applicantUserId: "u1",
    applicantDisplayName: "Боец",
    state: "APPLICATION_STATE_SUBMITTED",
    club: "",
    needsEquipment: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("NominationApplyCta (spec 0036, FR-10..FR-12/FR-14)", () => {
  it("гость: ничего не рендерится (FR-14)", () => {
    useMyApplicationsMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(
      <NominationApplyCta nomination={nomination()} isAuthenticated={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("гость: не отправляет запрос списка заявок (enabled: false — гарантированный 401 иначе)", () => {
    useMyApplicationsMock.mockReturnValue({ data: [], isLoading: false });
    render(<NominationApplyCta nomination={nomination()} isAuthenticated={false} />);
    expect(useMyApplicationsMock).toHaveBeenCalledWith({ enabled: false });
  });

  it("вошедший: запрашивает список заявок (enabled: true)", () => {
    useMyApplicationsMock.mockReturnValue({ data: [], isLoading: false });
    render(<NominationApplyCta nomination={nomination()} isAuthenticated={true} />);
    expect(useMyApplicationsMock).toHaveBeenCalledWith({ enabled: true });
  });

  it("закрытый приём: подпись «Приём заявок завершён» (FR-12)", () => {
    useMyApplicationsMock.mockReturnValue({ data: [], isLoading: false });
    render(
      <NominationApplyCta
        nomination={nomination({ status: "NOMINATION_STATUS_CLOSED" })}
        isAuthenticated={true}
      />,
    );
    expect(screen.getByText("Приём заявок завершён")).toBeInTheDocument();
  });

  it("открытый приём без активной заявки: кнопка-ссылка на форму подачи", () => {
    useMyApplicationsMock.mockReturnValue({ data: [], isLoading: false });
    render(<NominationApplyCta nomination={nomination()} isAuthenticated={true} />);
    const link = screen.getByRole("link", { name: /Подать заявку/ });
    expect(link).toHaveAttribute("href", "/nominations/n1/apply");
  });

  it("открытый приём с активной заявкой: состояние + ссылка «Мои заявки» (FR-11)", () => {
    useMyApplicationsMock.mockReturnValue({
      data: [application({ state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" })],
      isLoading: false,
    });
    render(<NominationApplyCta nomination={nomination()} isAuthenticated={true} />);
    expect(screen.getByText("Ожидает подтверждения оплаты")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Мои заявки/ });
    expect(link).toHaveAttribute("href", "/applications");
  });

  it("терминальная заявка в этой номинации не блокирует подачу новой", () => {
    useMyApplicationsMock.mockReturnValue({
      data: [application({ state: "APPLICATION_STATE_WITHDRAWN" })],
      isLoading: false,
    });
    render(<NominationApplyCta nomination={nomination()} isAuthenticated={true} />);
    expect(screen.getByRole("link", { name: /Подать заявку/ })).toBeInTheDocument();
  });

  it("активная заявка в другой номинации не мешает подаче в текущую", () => {
    useMyApplicationsMock.mockReturnValue({
      data: [application({ nominationId: "n2" })],
      isLoading: false,
    });
    render(<NominationApplyCta nomination={nomination()} isAuthenticated={true} />);
    expect(screen.getByRole("link", { name: /Подать заявку/ })).toBeInTheDocument();
  });

  it("пока грузятся заявки: не показывается ни кнопка, ни блок активной заявки", () => {
    useMyApplicationsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<NominationApplyCta nomination={nomination()} isAuthenticated={true} />);
    expect(screen.queryByRole("link", { name: /Подать заявку/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Мои заявки/ })).not.toBeInTheDocument();
  });
});
