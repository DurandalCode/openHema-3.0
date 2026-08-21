import { describe, expect, it } from "vitest";
import { journalEntryText, journalEntryTime, type JournalEntryDto } from "./journal";

function entry(partial: Partial<JournalEntryDto>): JournalEntryDto {
  return {
    boutId: "bout-1",
    sequenceNumber: 7,
    fighterA: { fighterId: "a", name: "Ильин", club: "" },
    fighterB: { fighterId: "b", name: "Дерюгин", club: "" },
    kind: "BOUT_EVENT_KIND_STARTED",
    scoreA: 0,
    scoreB: 0,
    occurredAt: "2026-08-15T14:12:40",
    actorDisplayName: "Тихонов",
    ...partial,
  };
}

describe("entities/arena-live/lib/journal journalEntryText", () => {
  it("formats a STARTED entry (macet 16a)", () => {
    expect(journalEntryText(entry({ kind: "BOUT_EVENT_KIND_STARTED" }))).toBe(
      "бой 7 начат",
    );
  });

  it("formats a FINISHED entry with the final score (macet 16a, AC-19)", () => {
    expect(
      journalEntryText(
        entry({
          sequenceNumber: 6,
          kind: "BOUT_EVENT_KIND_FINISHED",
          scoreA: 2,
          scoreB: 5,
        }),
      ),
    ).toBe("бой 6 завершён · Ильин 2 : 5 Дерюгин");
  });

  it("formats a SCORED entry with the running score", () => {
    expect(
      journalEntryText(
        entry({ kind: "BOUT_EVENT_KIND_SCORED", scoreA: 4, scoreB: 6 }),
      ),
    ).toBe("бой 7 · счёт 4 : 6");
  });

  it("formats a REOPENED entry", () => {
    expect(journalEntryText(entry({ kind: "BOUT_EVENT_KIND_REOPENED" }))).toBe(
      "бой 7 переоткрыт",
    );
  });

  it("formats a RESET entry", () => {
    expect(journalEntryText(entry({ kind: "BOUT_EVENT_KIND_RESET" }))).toBe(
      "бой 7 сброшен",
    );
  });

  it("does not break on an empty actorDisplayName (deleted user)", () => {
    expect(() =>
      journalEntryText(entry({ actorDisplayName: "" })),
    ).not.toThrow();
    expect(journalEntryText(entry({ actorDisplayName: "" }))).toBe(
      "бой 7 начат",
    );
  });
});

describe("entities/arena-live/lib/journal journalEntryTime", () => {
  it("formats occurredAt as HH:MM:SS (macet 16a)", () => {
    expect(journalEntryTime(entry({ occurredAt: "2026-08-15T14:12:40" }))).toBe(
      "14:12:40",
    );
  });

  it("pads single-digit hours/minutes/seconds", () => {
    expect(journalEntryTime(entry({ occurredAt: "2026-08-15T09:05:03" }))).toBe(
      "09:05:03",
    );
  });
});
