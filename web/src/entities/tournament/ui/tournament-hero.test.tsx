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
    program: [],
    regulationsFile: { url: "", name: "", size: 0 },
    emblemFile: { url: "", name: "", size: 0 },
    notifications: { applicationState: false, poolSeated: false },
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

describe("entities/tournament/ui TournamentHero facts (spec 0039, FR-1..FR-5)", () => {
  afterEach(cleanup);

  it("shows the venue when both name and address are set (AC-1)", () => {
    render(
      <TournamentHero
        tournament={tournament({
          venueName: "Дворец спорта",
          venueAddress: "ул. Ленина, 1",
        })}
        now={now}
      />,
    );
    expect(screen.getByText("Дворец спорта, ул. Ленина, 1")).toBeInTheDocument();
  });

  it("hides the venue line when neither name nor address is set (AC-2)", () => {
    render(
      <TournamentHero
        tournament={tournament({ venueName: "", venueAddress: "" })}
        now={now}
      />,
    );
    // Кроме заголовка турнира, никакого другого текста с площадкой быть не должно.
    expect(screen.queryByText(/Дворец спорта/)).not.toBeInTheDocument();
  });

  it("shows the entry fee when set (AC-1)", () => {
    render(
      <TournamentHero
        tournament={tournament({ entryFeeMinor: 150000, entryFeeCurrency: "RUB" })}
        now={now}
      />,
    );
    expect(screen.getByText(/1.500 RUB/)).toBeInTheDocument();
  });

  it("hides the entry fee when not set (AC-2)", () => {
    render(
      <TournamentHero tournament={tournament({ entryFeeMinor: null })} now={now} />,
    );
    expect(screen.queryByText(/Бесплатно/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RUB/)).not.toBeInTheDocument();
  });

  it("shows the regulations link when set (AC-1)", () => {
    render(
      <TournamentHero
        tournament={tournament({ regulationsUrl: "https://example.com/rules.pdf" })}
        now={now}
      />,
    );
    const link = screen.getByRole("link", { name: /Регламент турнира/ });
    expect(link).toHaveAttribute("href", "https://example.com/rules.pdf");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("hides the regulations link when not set (AC-2)", () => {
    render(<TournamentHero tournament={tournament({ regulationsUrl: "" })} now={now} />);
    expect(screen.queryByText(/Регламент турнира/)).not.toBeInTheDocument();
  });

  it("shows the arenas count when arenasCount is passed (AC-3)", () => {
    render(<TournamentHero tournament={tournament()} now={now} arenasCount={3} />);
    expect(screen.getByText(/Площадок:\s*3/)).toBeInTheDocument();
  });

  it("hides the arenas count when arenasCount is not passed (AC-2)", () => {
    render(<TournamentHero tournament={tournament()} now={now} />);
    expect(screen.queryByText(/Площадок/)).not.toBeInTheDocument();
  });

  it("hides the arenas count when arenasCount is zero (nothing to show)", () => {
    render(<TournamentHero tournament={tournament()} now={now} arenasCount={0} />);
    expect(screen.queryByText(/Площадок/)).not.toBeInTheDocument();
  });
});

// spec 0042 (T41, FR-30/FR-31/FR-34): загруженный файл вытесняет ссылку —
// эмблема/регламент читаются через резолверы `emblemSrc`/`regulationsHref`,
// не напрямую из `emblemUrl`/`regulationsUrl`.
describe("entities/tournament/ui TournamentHero files (spec 0042, FR-30/FR-31/FR-34)", () => {
  afterEach(cleanup);

  it("draws the emblem from the uploaded file when set, proxied through the BFF", () => {
    render(
      <TournamentHero
        tournament={tournament({
          emblemUrl: "https://cdn.example.com/logo.png",
          emblemFile: { url: "/files/e1", name: "logo.png", size: 100 },
        })}
        now={now}
      />,
    );
    const img = screen.getByAltText("Кубок Севера");
    expect(img).toHaveAttribute("src", "/api/files/e1");
  });

  it("falls back to emblemUrl when no file is uploaded", () => {
    render(
      <TournamentHero
        tournament={tournament({ emblemUrl: "https://cdn.example.com/logo.png" })}
        now={now}
      />,
    );
    const img = screen.getByAltText("Кубок Севера");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/logo.png");
  });

  it("links the regulations to the uploaded file when set, proxied through the BFF", () => {
    render(
      <TournamentHero
        tournament={tournament({
          regulationsUrl: "https://example.com/rules.pdf",
          regulationsFile: { url: "/files/r1", name: "rules.pdf", size: 100 },
        })}
        now={now}
      />,
    );
    const link = screen.getByRole("link", { name: /Регламент турнира/ });
    expect(link).toHaveAttribute("href", "/api/files/r1");
  });

  it("links the regulations to regulationsUrl when no file is uploaded", () => {
    render(
      <TournamentHero
        tournament={tournament({ regulationsUrl: "https://example.com/rules.pdf" })}
        now={now}
      />,
    );
    const link = screen.getByRole("link", { name: /Регламент турнира/ });
    expect(link).toHaveAttribute("href", "https://example.com/rules.pdf");
  });
});

describe("entities/tournament/ui TournamentHero program (spec 0040, FR-15/FR-16)", () => {
  afterEach(cleanup);

  it("shows the program by days when set (AC-10)", () => {
    render(
      <TournamentHero
        tournament={tournament({
          program: [
            { date: "2026-12-01", items: [{ timeLabel: "9:00", text: "Сбор участников" }] },
          ],
        })}
        now={now}
      />,
    );
    expect(screen.getByText("Сбор участников")).toBeInTheDocument();
  });

  it("hides the program section when it is empty (AC-11)", () => {
    render(<TournamentHero tournament={tournament({ program: [] })} now={now} />);
    expect(document.getElementById("tournament-program")).not.toBeInTheDocument();
  });
});
