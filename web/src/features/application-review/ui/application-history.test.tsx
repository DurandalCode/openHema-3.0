// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Application, ApplicationEvent } from "@/entities/application/lib/types";
import { ApplicationHistory } from "./application-history";

afterEach(() => {
  cleanup();
});

const application: Application = {
  id: "a1",
  nominationId: "n1",
  tournamentId: "t1",
  applicantUserId: "fighter-1",
  applicantDisplayName: "Иван Петров",
  state: "APPLICATION_STATE_PAID",
  club: "Клинок",
  needsEquipment: false,
  createdAt: "2026-03-18T00:00:00.000Z",
  updatedAt: "2026-03-20T00:00:00.000Z",
};

function ev(overrides: Partial<ApplicationEvent>): ApplicationEvent {
  return {
    type: "APPLICATION_EVENT_TYPE_SUBMITTED",
    actorId: "fighter-1",
    actorDisplayName: "Иван Петров",
    occurredAt: "2026-03-18T10:00:00.000Z",
    sequence: 1,
    ...overrides,
  };
}

describe("ApplicationHistory", () => {
  it("shows a loading state", () => {
    render(
      <ApplicationHistory application={application} history={[]} isLoading error={null} onRetry={vi.fn()} />,
    );
    expect(screen.getByText(/Загрузка/)).toBeInTheDocument();
  });

  it("shows an error with a retry action, scoped to the history area (FR-25)", () => {
    const onRetry = vi.fn();
    render(
      <ApplicationHistory
        application={application}
        history={[]}
        isLoading={false}
        error={new Error("Не удалось загрузить историю")}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Не удалось загрузить историю")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders events with author name + role, and a muted next-step line (AC-9)", () => {
    const history = [
      ev({ sequence: 1, actorId: "fighter-1", actorDisplayName: "Иван Петров" }),
      ev({
        type: "APPLICATION_EVENT_TYPE_PAYMENT_DECLARED",
        sequence: 2,
        actorId: "fighter-1",
        actorDisplayName: "Иван Петров",
      }),
      ev({
        type: "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED",
        sequence: 3,
        actorId: "admin-1",
        actorDisplayName: "Кораблёва Анна",
      }),
    ];

    render(
      <ApplicationHistory application={application} history={history} isLoading={false} error={null} onRetry={vi.fn()} />,
    );

    expect(screen.getByText("Заявка подана")).toBeInTheDocument();
    expect(screen.getByText("Оплата заявлена")).toBeInTheDocument();
    expect(screen.getByText("Оплата подтверждена")).toBeInTheDocument();
    expect(screen.getAllByText(/Иван Петров/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Кораблёва Анна/)).toBeInTheDocument();
    expect(screen.getByText(/организатор/)).toBeInTheDocument();
    expect(screen.getByText(/Боец зарегистрирован — ожидает действия секретаря/)).toBeInTheDocument();
  });

  it("shows only the role, not a fabricated name or id, when the author's name is empty (AC-12)", () => {
    const history = [ev({ actorId: "unknown", actorDisplayName: "" })];

    render(
      <ApplicationHistory application={application} history={history} isLoading={false} error={null} onRetry={vi.fn()} />,
    );

    expect(screen.getByText(/организатор/)).toBeInTheDocument();
    expect(screen.queryByText(/unknown/)).not.toBeInTheDocument();
  });
});
