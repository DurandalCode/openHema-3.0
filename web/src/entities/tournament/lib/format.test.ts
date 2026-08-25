import { describe, expect, it } from "vitest";
import {
  contactHref,
  daysUntil,
  formatEntryFee,
  formatEventRange,
  formatProgramDate,
  venueLine,
} from "./format";
import type { Tournament } from "./types";

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Кубок Севера",
    description: "",
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
    ...overrides,
  };
}

describe("entities/tournament/lib/format contactHref", () => {
  it("passes through http(s) URLs as-is", () => {
    expect(contactHref("CONTACT_TYPE_WEBSITE", "https://example.com")).toBe(
      "https://example.com",
    );
    expect(contactHref("CONTACT_TYPE_OTHER", "http://foo.test/path")).toBe(
      "http://foo.test/path",
    );
  });

  it("builds Telegram link from @handle", () => {
    expect(contactHref("CONTACT_TYPE_TELEGRAM", "@org")).toBe(
      "https://t.me/org",
    );
  });

  it("builds Telegram link from bare handle", () => {
    expect(contactHref("CONTACT_TYPE_TELEGRAM", "org")).toBe(
      "https://t.me/org",
    );
  });

  it("keeps full TG URL as-is", () => {
    expect(contactHref("CONTACT_TYPE_TELEGRAM", "https://t.me/org")).toBe(
      "https://t.me/org",
    );
  });

  it("builds VK link from username", () => {
    expect(contactHref("CONTACT_TYPE_VK", "org")).toBe("https://vk.com/org");
  });

  it("builds Facebook link from username", () => {
    expect(contactHref("CONTACT_TYPE_FACEBOOK", "org")).toBe(
      "https://facebook.com/org",
    );
  });

  it("builds mailto for email without scheme", () => {
    expect(contactHref("CONTACT_TYPE_EMAIL", "org@test")).toBe(
      "mailto:org@test",
    );
  });

  it("preserves email with proper scheme", () => {
    expect(contactHref("CONTACT_TYPE_EMAIL", "mailto:org@test")).toBe(
      "mailto:org@test",
    );
  });

  it("returns raw value for unknown type", () => {
    expect(contactHref("CONTACT_TYPE_UNSPECIFIED", "anything")).toBe(
      "anything",
    );
  });
});

describe("entities/tournament/lib/format formatEventRange", () => {
  it("returns null when both empty", () => {
    expect(formatEventRange("", "")).toBeNull();
  });

  it("formats single-day event (only start)", () => {
    const out = formatEventRange("2026-12-01T10:00:00Z", "");
    expect(out).not.toBeNull();
    expect(out).toContain(":");
    expect(out).not.toContain("—");
  });

  it("formats multi-day event with start + end", () => {
    const out = formatEventRange(
      "2026-12-01T10:00:00Z",
      "2026-12-03T18:00:00Z",
    );
    expect(out).toContain("—");
  });

  it("hides date in end when same day as start", () => {
    const out = formatEventRange(
      "2026-12-01T10:00:00Z",
      "2026-12-01T18:00:00Z",
    );
    expect(out).toContain("—");
  });

  it("returns null on invalid date", () => {
    expect(formatEventRange("not-a-date", "")).toBeNull();
  });
});

describe("entities/tournament/lib/format daysUntil", () => {
  it("returns a positive number of days for a future date", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    expect(daysUntil("2026-08-25T09:00:00Z", now)).toBe(3);
  });

  it("returns 0 when the start date is today (AC-2 'сегодня')", () => {
    // Полдень UTC — безопасное значение, не пересекающее полночь по
    // местному времени в разумном диапазоне часовых поясов теста.
    const now = new Date("2026-08-22T12:00:00Z");
    expect(daysUntil("2026-08-22T12:00:00Z", now)).toBe(0);
  });

  it("returns null when startIso is empty", () => {
    expect(daysUntil("", new Date("2026-08-22T12:00:00Z"))).toBeNull();
  });

  it("returns null when startIso is not a valid date", () => {
    expect(daysUntil("not-a-date", new Date("2026-08-22T12:00:00Z"))).toBeNull();
  });

  it("returns a negative number for a past date (tournament already started/over)", () => {
    // Решение: daysUntil не решает, идёт ли турнир — это задача
    // tournamentPhase. Честный отрицательный результат, без null.
    const now = new Date("2026-08-22T12:00:00Z");
    expect(daysUntil("2026-08-20T09:00:00Z", now)).toBe(-2);
  });
});

describe("entities/tournament/lib/format formatEntryFee (spec 0038, FR-44)", () => {
  it("returns null when the fee is not set (tile is not rendered at all)", () => {
    expect(formatEntryFee(null, "RUB")).toBeNull();
  });

  it("returns null when the fee is not set even without a currency", () => {
    expect(formatEntryFee(null, "")).toBeNull();
  });

  it('reads a zero fee as free participation, distinct from "not set"', () => {
    expect(formatEntryFee(0, "RUB")).toBe("Бесплатно");
  });

  it("formats a positive fee in major units with the currency code", () => {
    // Intl.NumberFormat("ru-RU") группирует разряды неразрывным пробелом
    // (U+00A0), не обычным — сравниваем через regex, чтобы не завязывать
    // тест на конкретный юникод-символ.
    expect(formatEntryFee(150000, "RUB")).toMatch(/^1\s500 RUB$/);
  });

  it("formats a fractional fee in major units", () => {
    expect(formatEntryFee(150050, "RUB")).toMatch(/^1\s500,5 RUB$/);
  });

  it("omits a trailing space when the currency is empty", () => {
    expect(formatEntryFee(150000, "")).toMatch(/^1\s500$/);
  });
});

describe("entities/tournament/lib/format formatProgramDate (spec 0040, FR-14)", () => {
  it("formats a YYYY-MM-DD date without a time part", () => {
    expect(formatProgramDate("2026-12-01")).toBe(
      new Date("2026-12-01T00:00:00").toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );
  });

  it("returns an empty string for an empty date", () => {
    expect(formatProgramDate("")).toBe("");
  });

  it("falls back to the raw string on an invalid date", () => {
    expect(formatProgramDate("not-a-date")).toBe("not-a-date");
  });
});

describe("entities/tournament/lib/format venueLine (spec 0039, FR-1)", () => {
  it("joins name and address when both are set", () => {
    expect(
      venueLine(tournament({ venueName: "Дворец спорта", venueAddress: "ул. Ленина, 1" })),
    ).toBe("Дворец спорта, ул. Ленина, 1");
  });

  it("returns only the name when the address is empty", () => {
    expect(venueLine(tournament({ venueName: "Дворец спорта", venueAddress: "" }))).toBe(
      "Дворец спорта",
    );
  });

  it("returns only the address when the name is empty", () => {
    expect(venueLine(tournament({ venueName: "", venueAddress: "ул. Ленина, 1" }))).toBe(
      "ул. Ленина, 1",
    );
  });

  it("returns an empty string when neither is set", () => {
    expect(venueLine(tournament({ venueName: "", venueAddress: "" }))).toBe("");
  });
});
