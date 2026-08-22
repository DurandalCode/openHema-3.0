// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { NominationsList } from "./nominations-list";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { NominationParticipants } from "@/entities/application/lib/types";

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

function participants(overrides: Partial<NominationParticipants> = {}): NominationParticipants {
  return {
    participants: [],
    appliedCount: 0,
    confirmedCount: 0,
    fighterCapacity: null,
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return render(ui, { wrapper: Wrapper });
}

describe("widgets/nominations-list NominationsList (spec 0034, FR-6..FR-8)", () => {
  afterEach(cleanup);

  it("renders nothing when there are no nominations", () => {
    const { container } = render(
      <NominationsList
        nominations={[]}
        participantsByNomination={{}}
        isAuthenticated={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the fill bar and remaining seats when capacity is set (AC-3)", () => {
    render(
      <NominationsList
        nominations={[nomination({ fighterCapacity: 24 })]}
        participantsByNomination={{
          n1: participants({ appliedCount: 19, confirmedCount: 15, fighterCapacity: 24 }),
        }}
        isAuthenticated={false}
      />,
    );

    expect(screen.getByText("Заявлено 19 · подтверждено 15 / 24")).toBeInTheDocument();
    expect(screen.getByText("Осталось 5 мест")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "19");
    expect(bar).toHaveAttribute("aria-valuemax", "24");
  });

  it("hides the fill bar and remaining-seats line when capacity is not set (AC-4)", () => {
    render(
      <NominationsList
        nominations={[nomination()]}
        participantsByNomination={{
          n1: participants({ appliedCount: 5, confirmedCount: 2, fighterCapacity: null }),
        }}
        isAuthenticated={false}
      />,
    );

    expect(screen.getByText("Заявлено 5 · подтверждено 2")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Осталось/)).not.toBeInTheDocument();
  });

  it("never shows a negative remaining-seats count when applied exceeds capacity", () => {
    render(
      <NominationsList
        nominations={[nomination({ fighterCapacity: 10 })]}
        participantsByNomination={{
          n1: participants({ appliedCount: 12, confirmedCount: 10, fighterCapacity: 10 }),
        }}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByText("Осталось 0 мест")).toBeInTheDocument();
  });

  it('shows "Приём заявок завершён" instead of the submit button for an authenticated user on a closed nomination (AC-5)', () => {
    render(
      <NominationsList
        nominations={[nomination({ status: "NOMINATION_STATUS_CLOSED" })]}
        participantsByNomination={{ n1: participants() }}
        isAuthenticated={true}
      />,
    );
    expect(screen.getByText("Приём заявок завершён")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Подать заявку/ })).not.toBeInTheDocument();
  });

  it("shows the submit action for an authenticated user on an open nomination", () => {
    renderWithQuery(
      <NominationsList
        nominations={[nomination({ status: "NOMINATION_STATUS_OPEN" })]}
        participantsByNomination={{ n1: participants() }}
        isAuthenticated={true}
      />,
    );
    expect(screen.getByPlaceholderText("Клуб (необязательно)")).toBeInTheDocument();
  });

  it("shows a link to the nomination's public page (FR-8)", () => {
    render(
      <NominationsList
        nominations={[nomination()]}
        participantsByNomination={{ n1: participants() }}
        isAuthenticated={false}
      />,
    );
    const link = screen.getByRole("link", { name: /Пулы и бои/ });
    expect(link).toHaveAttribute("href", "/nominations/n1");
  });

  it("does not render a submit action or closed-registration note for a guest", () => {
    render(
      <NominationsList
        nominations={[nomination()]}
        participantsByNomination={{ n1: participants() }}
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByText("Приём заявок завершён")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Клуб (необязательно)")).not.toBeInTheDocument();
  });
});
