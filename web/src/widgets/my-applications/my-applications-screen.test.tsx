// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/entities/application/lib/types";
import { MyApplicationsScreen } from "./my-applications-screen";
import { UnauthorizedError } from "@/shared/api/unauthorized";

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
    club: "",
    needsEquipment: false,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    ...overrides,
  };
}

let myApplicationsState: {
  data: Application[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
} = { data: [], isLoading: false, isError: false };
const refetchMock = vi.fn();

vi.mock("@/features/my-applications/api/use-my-applications", () => ({
  useMyApplications: () => ({ ...myApplicationsState, refetch: refetchMock }),
}));

const cardCalls: Array<{ application: Application; nominationTitle?: string }> = [];
vi.mock("@/features/my-applications/ui/application-card", () => ({
  ApplicationCard: (props: { application: Application; nominationTitle?: string }) => {
    cardCalls.push(props);
    return (
      <div data-testid="application-card">
        {props.application.id} — {props.nominationTitle ?? "(без названия)"}
      </div>
    );
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  cardCalls.length = 0;
  myApplicationsState = { data: [], isLoading: false, isError: false };
});

describe("MyApplicationsScreen", () => {
  it("shows a skeleton while loading (FR-24)", () => {
    myApplicationsState = { data: undefined, isLoading: true, isError: false };
    const { container } = render(<MyApplicationsScreen nominationTitleById={{}} />);

    expect(container.querySelector('[data-slot="skeleton-cards"]')).toBeInTheDocument();
    expect(screen.queryByTestId("application-card")).not.toBeInTheDocument();
  });

  it("shows a styled error state with retry on load failure, not 'no applications' (FR-24/AC-12)", () => {
    myApplicationsState = { data: undefined, isLoading: false, isError: true };
    render(<MyApplicationsScreen nominationTitleById={{}} />);

    expect(screen.queryByText(/Заявок пока нет/)).not.toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Повторить" });
    fireEvent.click(retryButton);
    expect(refetchMock).toHaveBeenCalled();
  });

  it("renders nothing extra on UnauthorizedError — the global session-expired dialog already covers it (spec 0038, FR-18)", () => {
    myApplicationsState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new UnauthorizedError(),
    };
    render(<MyApplicationsScreen nominationTitleById={{}} />);

    expect(screen.queryByText("Не удалось загрузить заявки")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Заявок пока нет/)).not.toBeInTheDocument();
  });

  it("shows an empty state with a link to nominations when there are no applications (FR-25/AC-13)", () => {
    myApplicationsState = { data: [], isLoading: false, isError: false };
    render(<MyApplicationsScreen nominationTitleById={{}} />);

    expect(screen.getByText(/Заявок пока нет/)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/#nominations");
  });

  it("renders a card per application with the title resolved from the map, undefined on a miss (AC-7/FR-26)", () => {
    myApplicationsState = {
      data: [app({ id: "a1", nominationId: "n1" }), app({ id: "a2", nominationId: "n-unknown" })],
      isLoading: false,
      isError: false,
    };
    render(<MyApplicationsScreen nominationTitleById={{ n1: "Лонгсворд" }} />);

    expect(screen.getAllByTestId("application-card")).toHaveLength(2);
    expect(cardCalls[0]).toMatchObject({ nominationTitle: "Лонгсворд" });
    expect(cardCalls[1].nominationTitle).toBeUndefined();
  });
});
