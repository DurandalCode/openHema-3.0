// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/entities/application/lib/types";
import { MyApplicationsPreview } from "./my-applications-preview";
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

vi.mock("@/features/my-applications/ui/application-card", () => ({
  ApplicationCard: (props: { application: Application; nominationTitle?: string }) => (
    <div data-testid="application-card">
      {props.application.id} — {props.nominationTitle ?? "(без названия)"}
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  myApplicationsState = { data: [], isLoading: false, isError: false };
});

describe("widgets/dashboard/MyApplicationsPreview", () => {
  it("shows a skeleton while loading", () => {
    myApplicationsState = { data: undefined, isLoading: true, isError: false };
    const { container } = render(<MyApplicationsPreview nominationTitleById={{}} />);

    expect(container.querySelector('[data-slot="skeleton-cards"]')).toBeInTheDocument();
  });

  it("shows a styled error with retry on a generic load failure, not 'no applications'", () => {
    myApplicationsState = { data: undefined, isLoading: false, isError: true, error: new Error("boom") };
    render(<MyApplicationsPreview nominationTitleById={{}} />);

    expect(screen.queryByText(/Заявок пока нет/)).not.toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Повторить" });
    fireEvent.click(retryButton);
    expect(refetchMock).toHaveBeenCalled();
  });

  it("does not claim 'no applications' on UnauthorizedError — the global session-expired dialog covers it (spec 0038, FR-18)", () => {
    myApplicationsState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new UnauthorizedError(),
    };
    render(<MyApplicationsPreview nominationTitleById={{}} />);

    expect(screen.queryByText(/Заявок пока нет/)).not.toBeInTheDocument();
    expect(screen.queryByText("Не удалось загрузить заявки")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
  });

  it("shows an empty-state invitation when there really are no applications", () => {
    myApplicationsState = { data: [], isLoading: false, isError: false };
    render(<MyApplicationsPreview nominationTitleById={{}} />);

    expect(screen.getByText(/Заявок пока нет/)).toBeInTheDocument();
  });

  it("renders up to PREVIEW_COUNT application cards", () => {
    myApplicationsState = {
      data: [app({ id: "a1" }), app({ id: "a2" }), app({ id: "a3" })],
      isLoading: false,
      isError: false,
    };
    render(<MyApplicationsPreview nominationTitleById={{}} />);

    expect(screen.getAllByTestId("application-card")).toHaveLength(2);
  });
});
