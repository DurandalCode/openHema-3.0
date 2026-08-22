// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TournamentHero } from "./tournament-hero";
import type { Tournament } from "../lib/types";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Кубок Севера",
    description: "Описание турнира",
    eventStartAt: "",
    eventEndAt: "",
    emblemUrl: "",
    isActive: true,
    contacts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    chiefJudge: "",
    regulationsUrl: "",
    venueName: "",
    venueAddress: "",
    entryFeeMinor: null,
    entryFeeCurrency: "",
    ...overrides,
  };
}

const now = new Date("2026-08-22T12:00:00Z");

describe("entities/tournament/ui TournamentHero (spec 0034, FR-3/FR-4)", () => {
  afterEach(cleanup);

  it("shows the placeholder when there is no tournament (FR-6)", () => {
    render(<TournamentHero tournament={null} now={now} />);
    expect(screen.getByText("Турнир скоро появится")).toBeInTheDocument();
  });

  it("shows the placeholder when the tournament has no title", () => {
    render(<TournamentHero tournament={tournament({ title: "" })} now={now} />);
    expect(screen.getByText("Турнир скоро появится")).toBeInTheDocument();
  });

  it("shows a countdown in days for N > 1 (AC-1)", () => {
    render(
      <TournamentHero
        tournament={tournament({ eventStartAt: "2026-08-25T09:00:00Z" })}
        now={now}
      />,
    );
    expect(screen.getByText("до старта: 3 дней")).toBeInTheDocument();
  });

  it('shows "завтра" when the start date is tomorrow (N=1)', () => {
    render(
      <TournamentHero
        tournament={tournament({ eventStartAt: "2026-08-23T09:00:00Z" })}
        now={now}
      />,
    );
    expect(screen.getByText("до старта: завтра")).toBeInTheDocument();
  });

  it('shows "сегодня" when the start date is today (N=0)', () => {
    render(
      <TournamentHero
        tournament={tournament({ eventStartAt: "2026-08-22T18:00:00Z" })}
        now={now}
      />,
    );
    expect(screen.getByText("до старта: сегодня")).toBeInTheDocument();
  });

  it("hides the countdown and the date line when no start date is set (AC-2)", () => {
    render(<TournamentHero tournament={tournament({ eventStartAt: "" })} now={now} />);
    expect(screen.queryByText(/до старта/)).not.toBeInTheDocument();
    // Остальные блоки не меняются (AC-2).
    expect(screen.getByText("Кубок Севера")).toBeInTheDocument();
    expect(screen.getByText("Описание турнира")).toBeInTheDocument();
  });

  it("hides the countdown for a start date already in the past", () => {
    render(
      <TournamentHero
        tournament={tournament({ eventStartAt: "2026-08-20T09:00:00Z" })}
        now={now}
      />,
    );
    expect(screen.queryByText(/до старта/)).not.toBeInTheDocument();
  });

  it("defaults `now` to the current time when the prop is omitted (backward compatibility)", () => {
    // Существующие вызывающие места (app/page.tsx, TournamentPreview) не
    // передают `now` — компонент не должен падать и не должен требовать
    // проп.
    expect(() =>
      render(<TournamentHero tournament={tournament({ eventStartAt: "2099-01-01T00:00:00Z" })} />),
    ).not.toThrow();
  });

  it("renders contacts with labels via contactLabel/contactHref (regression)", () => {
    render(
      <TournamentHero
        tournament={tournament({
          contacts: [{ id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org" }],
        })}
        now={now}
      />,
    );
    const link = screen.getByRole("link", { name: "Telegram: @org" });
    expect(link).toHaveAttribute("href", "https://t.me/org");
  });
});
