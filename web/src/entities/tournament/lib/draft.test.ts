import { describe, expect, it } from "vitest";
import {
  draftToTournament,
  tournamentDraftChanges,
  validateTournamentDraft,
  type TournamentDraft,
} from "./draft";
import type { Tournament } from "./types";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Клинок Севера 2026",
    description: "Ежегодный турнир",
    eventStartAt: "2026-12-01T10:00:00.000Z",
    eventEndAt: "2026-12-03T18:00:00.000Z",
    emblemUrl: "https://cdn.example.com/logo.png",
    isActive: true,
    contacts: [
      { id: "c1", type: "CONTACT_TYPE_TELEGRAM", value: "@org" },
      { id: "c2", type: "CONTACT_TYPE_VK", value: "org" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function draftFrom(saved: Tournament): TournamentDraft {
  return {
    title: saved.title,
    description: saved.description,
    emblemUrl: saved.emblemUrl,
    eventStartAt: saved.eventStartAt || null,
    eventEndAt: saved.eventEndAt || null,
    contacts: saved.contacts.map((c) => ({ type: c.type, value: c.value })),
  };
}

describe("entities/tournament/lib/draft tournamentDraftChanges (spec 0029, FR-7/AC-4/AC-5)", () => {
  it("returns an empty list for an identical draft", () => {
    const saved = tournament();
    expect(tournamentDraftChanges(saved, draftFrom(saved))).toEqual([]);
  });

  it("reports each changed field by name", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.title = "Новое название";
    draft.description = "Новое описание";
    draft.eventStartAt = "2026-12-02T10:00:00.000Z";
    draft.eventEndAt = "2026-12-04T18:00:00.000Z";
    draft.emblemUrl = "https://cdn.example.com/other.png";

    expect(tournamentDraftChanges(saved, draft)).toEqual([
      "название",
      "описание",
      "дата начала",
      "дата окончания",
      "эмблема",
    ]);
  });

  it("declines the changed-contacts label (singular)", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.contacts = [draft.contacts[0], { type: "CONTACT_TYPE_VK", value: "new-handle" }];

    expect(tournamentDraftChanges(saved, draft)).toEqual(["1 контакт"]);
  });

  it("declines the changed-contacts label (plural, 2-4)", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.contacts = [
      { type: "CONTACT_TYPE_TELEGRAM", value: "new-tg" },
      { type: "CONTACT_TYPE_VK", value: "new-vk" },
    ];

    expect(tournamentDraftChanges(saved, draft)).toEqual(["2 контакта"]);
  });

  it("does not count an empty added contact row as a change", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.contacts = [...draft.contacts, { type: "CONTACT_TYPE_TELEGRAM", value: "" }];

    expect(tournamentDraftChanges(saved, draft)).toEqual([]);
  });

  it("combines several field changes and the contact change in one list", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.title = "Новое название";
    draft.eventStartAt = "2026-12-05T10:00:00.000Z";
    draft.contacts[1] = { type: "CONTACT_TYPE_VK", value: "changed" };

    expect(tournamentDraftChanges(saved, draft)).toEqual([
      "название",
      "дата начала",
      "1 контакт",
    ]);
  });
});

describe("entities/tournament/lib/draft validateTournamentDraft (spec 0029, AC-7/AC-8)", () => {
  it("requires a non-empty title", () => {
    const draft = draftFrom(tournament({ title: "" }));
    expect(validateTournamentDraft(draft).title).toBeTruthy();
  });

  it("treats a whitespace-only title as empty", () => {
    const draft = draftFrom(tournament());
    draft.title = "   ";
    expect(validateTournamentDraft(draft).title).toBeTruthy();
  });

  it("rejects an end date earlier than the start date", () => {
    const draft = draftFrom(tournament());
    draft.eventStartAt = "2026-12-03T10:00:00.000Z";
    draft.eventEndAt = "2026-12-01T10:00:00.000Z";
    expect(validateTournamentDraft(draft).eventEndAt).toBeTruthy();
  });

  it("rejects an end date without a start date", () => {
    const draft = draftFrom(tournament());
    draft.eventStartAt = null;
    expect(validateTournamentDraft(draft).eventEndAt).toBeTruthy();
  });

  it("passes a valid draft without errors", () => {
    const draft = draftFrom(tournament());
    expect(validateTournamentDraft(draft)).toEqual({});
  });

  it("passes a draft with no dates at all", () => {
    const draft = draftFrom(tournament());
    draft.eventStartAt = null;
    draft.eventEndAt = null;
    expect(validateTournamentDraft(draft)).toEqual({});
  });
});

describe("entities/tournament/lib/draft draftToTournament (spec 0029, FR-3/FR-5/AC-2/AC-3)", () => {
  it("takes field values from the draft", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.title = "Черновик";
    draft.description = "Черновое описание";

    const preview = draftToTournament(saved, draft);
    expect(preview.title).toBe("Черновик");
    expect(preview.description).toBe("Черновое описание");
  });

  it("keeps id/createdAt/updatedAt/isActive from the saved tournament", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.title = "Черновик";

    const preview = draftToTournament(saved, draft);
    expect(preview.id).toBe(saved.id);
    expect(preview.createdAt).toBe(saved.createdAt);
    expect(preview.updatedAt).toBe(saved.updatedAt);
    expect(preview.isActive).toBe(saved.isActive);
  });

  it("drops empty contacts", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.contacts = [...draft.contacts, { type: "CONTACT_TYPE_EMAIL", value: "   " }];

    const preview = draftToTournament(saved, draft);
    expect(preview.contacts).toHaveLength(2);
    expect(preview.contacts.every((c) => c.value.trim() !== "")).toBe(true);
  });

  it("falls back to empty strings for cleared dates", () => {
    const saved = tournament();
    const draft = draftFrom(saved);
    draft.eventStartAt = null;
    draft.eventEndAt = null;

    const preview = draftToTournament(saved, draft);
    expect(preview.eventStartAt).toBe("");
    expect(preview.eventEndAt).toBe("");
  });
});
