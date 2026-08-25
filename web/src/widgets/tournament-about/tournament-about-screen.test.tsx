// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TournamentAboutScreen } from "./tournament-about-screen";
import type { Tournament } from "@/entities/tournament/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Кубок Севера",
    description: "Ежегодный турнир по историческому фехтованию",
    eventStartAt: "2026-12-01T10:00:00Z",
    eventEndAt: "2026-12-01T18:00:00Z",
    emblemUrl: "",
    isActive: true,
    contacts: [{ id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    chiefJudge: "Иван Иванов",
    regulationsUrl: "https://example.com/rules.pdf",
    venueName: "Дворец спорта",
    venueAddress: "г. Москва, ул. Спортивная, 1",
    entryFeeMinor: 150000,
    entryFeeCurrency: "RUB",
    program: [],
    ...overrides,
  };
}

function nomination(overrides: Partial<Nomination> = {}): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Лонгсворд",
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

describe("widgets/tournament-about TournamentAboutScreen (spec 0038, FR-43..FR-47)", () => {
  afterEach(cleanup);

  it("renders the tournament facts: title, description, when, where, nominations count, fee", () => {
    render(
      <TournamentAboutScreen
        tournament={tournament()}
        nominations={[nomination(), nomination({ id: "n2", title: "Меч и щит" })]}
      />,
    );

    expect(screen.getByText("Кубок Севера")).toBeInTheDocument();
    expect(
      screen.getByText("Ежегодный турнир по историческому фехтованию"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Дворец спорта/)).toBeInTheDocument();
    expect(screen.getByText(/г\. Москва, ул\. Спортивная, 1/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/1\s500 RUB/)).toBeInTheDocument();
  });

  it("renders the regulations block as a new-tab link when a URL is set (FR-45)", () => {
    render(<TournamentAboutScreen tournament={tournament()} nominations={[nomination()]} />);

    const link = screen.getByRole("link", { name: /регламент/i });
    expect(link).toHaveAttribute("href", "https://example.com/rules.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders the organizers block with chief judge and contacts together (FR-46)", () => {
    render(<TournamentAboutScreen tournament={tournament()} nominations={[nomination()]} />);

    expect(screen.getByText("Организаторы")).toBeInTheDocument();
    expect(screen.getByText(/Иван Иванов/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Telegram: @org/ })).toBeInTheDocument();
  });

  it("hides the regulations block when the URL is empty", () => {
    render(
      <TournamentAboutScreen
        tournament={tournament({ regulationsUrl: "" })}
        nominations={[nomination()]}
      />,
    );
    expect(screen.queryByRole("link", { name: /регламент/i })).not.toBeInTheDocument();
  });

  it("hides the chief judge line when it is empty, keeping contacts", () => {
    render(
      <TournamentAboutScreen
        tournament={tournament({ chiefJudge: "" })}
        nominations={[nomination()]}
      />,
    );
    expect(screen.queryByText(/главный судья/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Telegram: @org/ })).toBeInTheDocument();
  });

  it("hides the whole organizers block when neither chief judge nor contacts are set", () => {
    render(
      <TournamentAboutScreen
        tournament={tournament({ chiefJudge: "", contacts: [] })}
        nominations={[nomination()]}
      />,
    );
    expect(screen.queryByText("Организаторы")).not.toBeInTheDocument();
  });

  it("hides the venue fact tile when venueName and venueAddress are both empty", () => {
    render(
      <TournamentAboutScreen
        tournament={tournament({ venueName: "", venueAddress: "" })}
        nominations={[nomination()]}
      />,
    );
    expect(screen.queryByText("Где")).not.toBeInTheDocument();
  });

  it("shows a free-participation label for a zero fee, distinct from an unset fee", () => {
    render(
      <TournamentAboutScreen
        tournament={tournament({ entryFeeMinor: 0 })}
        nominations={[nomination()]}
      />,
    );
    expect(screen.getByText("Бесплатно")).toBeInTheDocument();
  });

  it("hides the fee tile entirely when the fee is not set (null, distinct from 0)", () => {
    render(
      <TournamentAboutScreen
        tournament={tournament({ entryFeeMinor: null, entryFeeCurrency: "" })}
        nominations={[nomination()]}
      />,
    );
    expect(screen.queryByText("Взнос")).not.toBeInTheDocument();
    expect(screen.queryByText("Бесплатно")).not.toBeInTheDocument();
  });

  it('shows the "apply" CTA when at least one nomination accepts applications (FR-47)', () => {
    render(
      <TournamentAboutScreen
        tournament={tournament()}
        nominations={[
          nomination({ status: "NOMINATION_STATUS_CLOSED" }),
          nomination({ id: "n2", status: "NOMINATION_STATUS_OPEN" }),
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /подать заявку/i })).toBeInTheDocument();
  });

  it('hides the "apply" CTA when no nomination accepts applications', () => {
    render(
      <TournamentAboutScreen
        tournament={tournament()}
        nominations={[nomination({ status: "NOMINATION_STATUS_CLOSED" })]}
      />,
    );
    expect(screen.queryByRole("link", { name: /подать заявку/i })).not.toBeInTheDocument();
  });

  it("hides the apply CTA when there are no nominations at all", () => {
    render(<TournamentAboutScreen tournament={tournament()} nominations={[]} />);
    expect(screen.queryByRole("link", { name: /подать заявку/i })).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

});

describe("widgets/tournament-about TournamentAboutScreen program (spec 0040, FR-15/FR-16)", () => {
  afterEach(cleanup);

  it("shows the program by days when set (AC-10)", () => {
    render(
      <TournamentAboutScreen
        tournament={tournament({
          program: [
            { date: "2026-12-01", items: [{ timeLabel: "9:00", text: "Сбор участников" }] },
          ],
        })}
        nominations={[nomination()]}
      />,
    );
    expect(screen.getByText("Сбор участников")).toBeInTheDocument();
  });

  it("hides the program section when it is empty (AC-11)", () => {
    render(
      <TournamentAboutScreen tournament={tournament({ program: [] })} nominations={[nomination()]} />,
    );
    expect(document.getElementById("tournament-program")).not.toBeInTheDocument();
  });
});

