// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplyScreen } from "./apply-screen";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { Application } from "@/entities/application/lib/types";

afterEach(() => {
  cleanup();
});

vi.mock("@/features/my-applications/ui/apply-application-form", () => ({
  ApplyApplicationForm: ({ nominationId }: { nominationId: string }) => (
    <div data-testid="apply-form-stub">ApplyApplicationForm:{nominationId}</div>
  ),
}));

vi.mock("./apply-what-next", () => ({
  ApplyWhatNext: () => <div data-testid="apply-what-next-stub">ApplyWhatNext</div>,
}));

let myApplicationsState: { data: Application[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
};
vi.mock("@/features/my-applications/api/use-my-applications", () => ({
  useMyApplications: () => myApplicationsState,
}));

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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("widgets/application-apply ApplyScreen", () => {
  beforeEach(() => {
    myApplicationsState = { data: [], isLoading: false };
  });

  it("shows the header with back link, title and tournament · nomination caption (FR-2)", () => {
    render(<ApplyScreen nomination={nomination()} tournamentName="Турнир весны" />);

    const back = screen.getByRole("link", { name: /← Длинный меч/ });
    expect(back).toHaveAttribute("href", "/nominations/n1");
    expect(screen.getByRole("heading", { name: "Заявка на участие" })).toBeInTheDocument();
    expect(screen.getByText("Турнир весны · Длинный меч")).toBeInTheDocument();
  });

  it("branch 1: open reception, no active application — renders the form and the what-next block (AC-1)", () => {
    render(<ApplyScreen nomination={nomination()} tournamentName="Турнир весны" />);

    expect(screen.getByTestId("apply-form-stub")).toHaveTextContent("n1");
    expect(screen.getByTestId("apply-what-next-stub")).toBeInTheDocument();
  });

  it("branch 2: closed reception — no form, explains closure and links back to the nomination (AC-5)", () => {
    render(
      <ApplyScreen
        nomination={nomination({ status: "NOMINATION_STATUS_CLOSED" })}
        tournamentName="Турнир весны"
      />,
    );

    expect(screen.queryByTestId("apply-form-stub")).not.toBeInTheDocument();
    expect(screen.getByText(/приём заявок.*завершён/i)).toBeInTheDocument();
    const links = screen.getAllByRole("link").filter((l) => l.getAttribute("href") === "/nominations/n1");
    expect(links.length).toBeGreaterThan(0);
  });

  it("branch 3: an active (non-terminal) application already exists — shows its state and a link to My applications (AC-4)", () => {
    myApplicationsState = {
      data: [application({ state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" })],
      isLoading: false,
    };

    render(<ApplyScreen nomination={nomination()} tournamentName="Турнир весны" />);

    expect(screen.queryByTestId("apply-form-stub")).not.toBeInTheDocument();
    expect(screen.getByText(/Ожидает подтверждения оплаты/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Мои заявки" })).toHaveAttribute(
      "href",
      "/applications",
    );
  });

  it("branch 3 ignores applications in a different nomination or terminal ones", () => {
    myApplicationsState = {
      data: [
        application({ nominationId: "other", state: "APPLICATION_STATE_SUBMITTED" }),
        application({ state: "APPLICATION_STATE_WITHDRAWN" }),
      ],
      isLoading: false,
    };

    render(<ApplyScreen nomination={nomination()} tournamentName="Турнир весны" />);

    expect(screen.getByTestId("apply-form-stub")).toBeInTheDocument();
  });
});
