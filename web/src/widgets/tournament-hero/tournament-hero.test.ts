import { describe, expect, it } from "vitest";
import { contactHref, formatEventRange } from "./tournament-hero";

describe("widgets/tournament-hero contactHref", () => {
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

describe("widgets/tournament-hero formatEventRange", () => {
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