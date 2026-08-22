import { describe, expect, it } from "vitest";
import { contactHref, daysUntil, formatEventRange } from "./format";

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
