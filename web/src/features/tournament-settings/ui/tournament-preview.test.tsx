// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TournamentPreview } from "./tournament-preview";
import {
  draftToTournament,
  entryFeeMinorToAmount,
  type TournamentDraft,
} from "@/entities/tournament/lib/draft";
import type { Tournament } from "@/entities/tournament/lib/types";

function saved(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Сохранённый турнир",
    description: "Сохранённое описание",
    eventStartAt: "2026-12-01T10:00:00.000Z",
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

function draftFrom(t: Tournament): TournamentDraft {
  return {
    title: t.title,
    description: t.description,
    emblemUrl: t.emblemUrl,
    eventStartAt: t.eventStartAt || null,
    eventEndAt: t.eventEndAt || null,
    contacts: t.contacts.map((c) => ({ type: c.type, value: c.value })),
    chiefJudge: t.chiefJudge,
    regulationsUrl: t.regulationsUrl,
    venueName: t.venueName,
    venueAddress: t.venueAddress,
    entryFeeAmount: entryFeeMinorToAmount(t.entryFeeMinor),
    entryFeeCurrency: t.entryFeeCurrency,
    program: t.program.map((d) => ({
      date: d.date,
      items: d.items.map((it) => ({ timeLabel: it.timeLabel, text: it.text })),
    })),
    notifications: t.notifications,
  };
}

afterEach(() => {
  cleanup();
});

describe("TournamentPreview (spec 0029, FR-3/FR-4/FR-6, AC-2/AC-3)", () => {
  it("shows the draft's values, not the saved ones (AC-2)", () => {
    const savedTournament = saved();
    const draft = draftFrom(savedTournament);
    draft.title = "Черновое название";
    draft.description = "Черновое описание";

    render(
      <TournamentPreview tournament={draftToTournament(savedTournament, draft)} />,
    );

    expect(screen.getByText("Черновое название")).toBeInTheDocument();
    expect(screen.getByText("Черновое описание")).toBeInTheDocument();
    expect(screen.queryByText("Сохранённый турнир")).not.toBeInTheDocument();
  });

  it("hides empty description/date lines and shows the placeholder for an empty title (AC-3)", () => {
    const savedTournament = saved();
    const draft = draftFrom(savedTournament);
    draft.title = "";
    draft.description = "";
    draft.eventStartAt = null;
    draft.eventEndAt = null;

    render(
      <TournamentPreview tournament={draftToTournament(savedTournament, draft)} />,
    );

    expect(screen.getByText("Турнир скоро появится")).toBeInTheDocument();
  });

  it('links "Открыть главную" to / in a new tab (FR-6)', () => {
    const savedTournament = saved();
    render(
      <TournamentPreview
        tournament={draftToTournament(savedTournament, draftFrom(savedTournament))}
      />,
    );

    const link = screen.getByRole("link", { name: "Открыть главную" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
